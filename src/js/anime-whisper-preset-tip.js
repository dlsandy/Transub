/**
 * One-time main-window tip for 3.0.5: try「日语 · Anime Whisper 翻译」preset.
 * Applying it turns off 智能感知 and persists the full preset options.
 */
(function (global) {
    const TIP_VERSION = '3.0.5';
    const STORAGE_KEY = 'transub.tip.anime-whisper-preset.v3.0.5';
    const PRESET_ID = 'ja-av-anime-whisper-translate';
    const PRESET_LABEL = '日语 · Anime Whisper 翻译';

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
        const chip = $('animeWhisperPresetQuickBtn') || $('autoSenseChip') || $('autoSenseToggle');
        if (!tip || !arrow || !chip) return;
        try {
            const tipRect = tip.getBoundingClientRect();
            const chipRect = chip.getBoundingClientRect();
            const center = chipRect.left + chipRect.width / 2 - tipRect.left;
            const left = Math.max(16, Math.min(tipRect.width - 28, center - 6));
            arrow.style.left = `${left}px`;
        } catch (_) { /* ignore */ }
    }

    function isAutoSenseOn() {
        const toggle = $('autoSenseToggle');
        if (toggle) {
            return toggle.getAttribute('aria-pressed') !== 'false';
        }
        return true;
    }

    function isAnimeWhisperPresetActive() {
        if (isAutoSenseOn()) return false;
        const asr = String(document.getElementById('engineAsrModelSelect')?.value || '').trim();
        const lang = String(document.getElementById('quickLanguageSelect')?.value
            || document.getElementById('languageSelect')?.value || '').trim();
        const task = String(document.getElementById('quickTaskSelect')?.value
            || document.getElementById('taskSelect')?.value || '').trim();
        return asr === 'anime-whisper' && lang === 'ja' && (task === 'translate' || task === 'dual');
    }

    function syncQuickBtnState() {
        const btn = $('animeWhisperPresetQuickBtn');
        if (!btn) return;
        const active = isAnimeWhisperPresetActive();
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.classList.toggle('is-active', active);
        if (active) {
            btn.title = '当前已是「日语 · Anime Whisper 翻译」相关参数（再点可重新套用并关闭智能感知）';
        } else if (isAutoSenseOn()) {
            btn.title = '智能感知开启中：点击切换到「日语 · Anime Whisper 翻译」并关闭智能感知';
        } else {
            btn.title = '切换到「日语 · Anime Whisper 翻译」预设（关闭智能感知并写入参数）';
        }
    }

    async function activateFromQuickBtn() {
        const btn = $('animeWhisperPresetQuickBtn');
        if (btn) btn.disabled = true;
        try {
            const result = await applyAnimeWhisperPreset();
            if (result.ok) {
                markDismissed();
                hideTipEl();
                syncQuickBtnState();
                global.TransubMainUiUx?.showToast?.(
                    `已切换到「${PRESET_LABEL}」并关闭智能感知`,
                    'ok',
                );
            } else {
                global.TransubMainUiUx?.showToast?.(
                    result.error || '切换预设失败',
                    'err',
                );
            }
            return result;
        } catch (err) {
            global.TransubMainUiUx?.showToast?.(
                err?.message || String(err) || '切换预设失败',
                'err',
            );
            return { ok: false, error: err?.message || String(err) };
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function bindQuickBtn() {
        const btn = $('animeWhisperPresetQuickBtn');
        if (!btn || btn.dataset.bound === '1') return false;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => {
            void activateFromQuickBtn();
        });
        syncQuickBtnState();
        return true;
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
            await features.applyPreset(PRESET_ID, { persist: true, autoSense: false });
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
        });
        core.setAutoSenseEnabled?.(false, { persist: false });
        const opts = {
            ...core.buildSavedOptionsFromForm(),
            autoSense: false,
            contentProfile: preset.options.contentProfile || 'av_soft',
        };
        const saveRes = await electron?.transWithAiSaveOptions?.(opts);
        if (saveRes && saveRes.ok === false) {
            return { ok: false, error: saveRes.error || '保存设置失败' };
        }
        core.setSavedOptionsSnapshot?.(opts);
        core.markSettingsDirty?.(false);
        const sel = $('presetSelect');
        if (sel) {
            const has = [...sel.options].some((o) => o.value === PRESET_ID);
            if (has) sel.value = PRESET_ID;
        }
        core.updateParamsSummary?.();
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
                        syncQuickBtnState();
                        global.TransubMainUiUx?.showToast?.(
                            `已套用「${PRESET_LABEL}」并关闭智能感知`,
                            'ok',
                        );
                    } else {
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

    function initQuickAccess() {
        bindQuickBtn();
        syncQuickBtnState();
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
        isAnimeWhisperPresetActive,
        syncQuickBtnState,
        bindQuickBtn,
        initQuickAccess,
        activateFromQuickBtn,
        maybeShow,
    };
}(window));
