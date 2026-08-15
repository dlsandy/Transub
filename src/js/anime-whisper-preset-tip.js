/**
 * One-time main-window tip for 3.0.5: try「Anime Whisper」preset.
 * Applying it turns off 智能感知 and persists the full preset options.
 */
(function (global) {
    const TIP_VERSION = '3.0.5';
    const STORAGE_KEY = 'transub.tip.anime-whisper-preset.v3.0.5';
    const PRESET_ID = 'ja-av-anime-whisper-translate';
    const PRESET_LABEL = 'Anime Whisper';

    function normalizeVersion(raw) {
        return String(raw || '').trim().replace(/^v/i, '');
    }

    function isTargetVersion(version) {
        return normalizeVersion(version) === TIP_VERSION;
    }

    function isDismissed(storage = global.localStorage) {
        try {
            return storage?.getItem?.(STORAGE_KEY) === '1';
        } catch (_) {
            return true;
        }
    }

    function markDismissed(storage = global.localStorage) {
        try {
            storage?.setItem?.(STORAGE_KEY, '1');
        } catch (_) { /* ignore */ }
    }

    function shouldShowTip(version, storage = global.localStorage) {
        return isTargetVersion(version) && !isDismissed(storage);
    }

    function $(id) {
        return document.getElementById(id);
    }

    function isBlockingModalOpen() {
        const wizard = $('setupWizardModal');
        if (wizard && !wizard.classList.contains('hidden')) return true;
        const env = $('envCheckModal');
        if (env && !env.classList.contains('hidden')) return true;
        return false;
    }

    function hideTipEl() {
        const el = $('animeWhisperPresetTip');
        el?.classList.add('hidden');
    }

    function showTipEl() {
        const el = $('animeWhisperPresetTip');
        if (!el) return false;
        el.classList.remove('hidden');
        positionArrow();
        return true;
    }

    function positionArrow() {
        const tip = $('animeWhisperPresetTip');
        const arrow = tip?.querySelector?.('.feature-tip-bubble-arrow');
        const chip = $('paramsModeBtn') || $('paramsModeChip') || $('paramsModeMenuWrap');
        if (!tip || !arrow || !chip) return;
        try {
            const tipRect = tip.getBoundingClientRect();
            const chipRect = chip.getBoundingClientRect();
            const center = chipRect.left + chipRect.width / 2 - tipRect.left;
            const left = Math.max(16, Math.min(tipRect.width - 28, center - 6));
            arrow.style.left = `${left}px`;
        } catch (_) { /* ignore */ }
    }

    async function resolveAppVersion(getVersion) {
        if (typeof getVersion === 'function') {
            try {
                const res = await getVersion();
                if (typeof res === 'string') return normalizeVersion(res);
                return normalizeVersion(res?.version);
            } catch (_) { /* ignore */ }
        }
        const electron = global.__ELECTRON__;
        if (typeof electron?.getAppVersion === 'function') {
            try {
                const res = await electron.getAppVersion();
                return normalizeVersion(res?.version);
            } catch (_) { /* ignore */ }
        }
        return '';
    }

    async function applyAnimeWhisperPreset() {
        const features = global.TransubFeatures;
        if (typeof features?.applyPreset === 'function') {
            const applied = await features.applyPreset(PRESET_ID, { persist: true, autoSense: false });
            if (applied === false) {
                return { ok: false, cancelled: true, error: '模型未下载' };
            }
            return { ok: true };
        }
        const core = global.TransubCore;
        const electron = global.__ELECTRON__;
        if (!core?.applyOptionsToForm || !core?.buildSavedOptionsFromForm) {
            return { ok: false, error: '核心未就绪' };
        }
        const res = await electron?.transWithAiGetPresets?.();
        const preset = res?.presets?.find((p) => p.id === PRESET_ID);
        if (!preset?.options) {
            return { ok: false, error: '未找到 Anime Whisper 预设' };
        }
        const current = core.buildSavedOptionsFromForm();
        await core.applyOptionsToForm({
            ...current,
            ...preset.options,
            autoSense: false,
            activePresetId: PRESET_ID,
        });
        core.setAutoSenseEnabled?.(false, { persist: false });
        core.applyActivePresetIdToSelect?.(PRESET_ID);
        const opts = {
            ...core.buildSavedOptionsFromForm(),
            autoSense: false,
            activePresetId: PRESET_ID,
            contentProfile: preset.options.contentProfile || 'av_soft',
        };
        const saveRes = await electron?.transWithAiSaveOptions?.(opts);
        if (saveRes && saveRes.ok === false) {
            return { ok: false, error: saveRes.error || '保存设置失败' };
        }
        core.setSavedOptionsSnapshot?.(opts);
        core.markSettingsDirty?.(false);
        core.updateParamsSummary?.();
        core.syncParamsModeChipUi?.();
        core.appendLog?.(
            `已应用预设「${preset.name || PRESET_LABEL}」并关闭智能感知`,
            'ok',
        );
        return { ok: true, preset };
    }

    function bindButtons(handlers) {
        const acceptBtn = $('animeWhisperPresetTipAccept');
        const dismissBtn = $('animeWhisperPresetTipDismiss');
        if (acceptBtn && !acceptBtn.dataset.bound) {
            acceptBtn.dataset.bound = '1';
            acceptBtn.addEventListener('click', () => handlers.onAccept?.());
        }
        if (dismissBtn && !dismissBtn.dataset.bound) {
            dismissBtn.dataset.bound = '1';
            dismissBtn.addEventListener('click', () => handlers.onDismiss?.());
        }
    }

    async function maybeShow(options = {}) {
        const {
            getVersion,
            storage = global.localStorage,
            waitMs = 1200,
            maxWaitMs = 120000,
            pollMs = 400,
        } = options;

        const version = await resolveAppVersion(getVersion);
        if (!shouldShowTip(version, storage)) return false;

        const host = $('animeWhisperPresetTip');
        if (!host) return false;

        bindButtons({
            onAccept: async () => {
                markDismissed(storage);
                hideTipEl();
                const acceptBtn = $('animeWhisperPresetTipAccept');
                if (acceptBtn) acceptBtn.disabled = true;
                try {
                    const result = await applyAnimeWhisperPreset();
                    if (result.ok) {
                        global.TransubMainUiUx?.showToast?.(
                            `已套用「${PRESET_LABEL}」并关闭智能感知`,
                            'ok',
                        );
                    } else if (!result.cancelled) {
                        global.TransubMainUiUx?.showToast?.(
                            result.error || '应用预设失败',
                            'err',
                        );
                    }
                } catch (err) {
                    global.TransubMainUiUx?.showToast?.(
                        err?.message || String(err) || '应用预设失败',
                        'err',
                    );
                } finally {
                    if (acceptBtn) acceptBtn.disabled = false;
                }
            },
            onDismiss: () => {
                markDismissed(storage);
                hideTipEl();
            },
        });

        await new Promise((r) => setTimeout(r, waitMs));
        const started = Date.now();
        while (isBlockingModalOpen() && Date.now() - started < maxWaitMs) {
            await new Promise((r) => setTimeout(r, pollMs));
            if (!shouldShowTip(version, storage)) return false;
        }
        if (!shouldShowTip(version, storage)) return false;
        if (isBlockingModalOpen()) return false;
        return showTipEl();
    }

    global.TransubAnimeWhisperPresetTip = {
        TIP_VERSION,
        STORAGE_KEY,
        PRESET_ID,
        PRESET_LABEL,
        normalizeVersion,
        isTargetVersion,
        isDismissed,
        markDismissed,
        shouldShowTip,
        applyAnimeWhisperPreset,
        maybeShow,
    };
}(window));
