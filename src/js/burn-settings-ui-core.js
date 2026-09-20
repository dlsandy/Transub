/**
 * Settings burn-encode form: apply options, refresh encoder list, browse/clear output dir.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubBurnSettingsUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function burnSettingsUiFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createBurnSettingsUi(deps) {
        const d = deps || {};
        const els = d.els || {};
        const electron = d.electron;
        const settingsNormApi = d.settingsNormApi
            || (global && global.TransubSettingsOptionsNormalize)
            || {};
        const getAdvancedEntitled = d.getAdvancedEntitled || (() => false);
        const markSettingsDirty = d.markSettingsDirty || (() => {});
        const setSaveParamsStatus = d.setSaveParamsStatus || (() => {});

        function applyBurnSettingsToForm(options = {}) {
            const burnNorm = (global && global.TransubSubtitleBurnCore?.normalizeBurnSettingsOptions)
                || settingsNormApi.normalizeBurnSettingsOptions;
            const n = burnNorm
                ? burnNorm(options)
                : {
                    burnContainer: options.burnContainer === 'mkv' ? 'mkv' : 'mp4',
                    burnEncoderId: String(options.burnEncoderId || 'libx264').trim() || 'libx264',
                    burnAudioMode: options.burnAudioMode === 'aac' ? 'aac' : 'copy',
                    burnCrf: 18,
                    burnResolutionId: String(options.burnResolutionId || 'source'),
                    burnFpsId: String(options.burnFpsId || 'source'),
                    burnEncodeSpeedId: String(options.burnEncodeSpeedId || 'medium'),
                    burnOutputSuffix: String(options.burnOutputSuffix || 'burned').trim() || 'burned',
                    burnOutputDir: String(options.burnOutputDir || '').trim(),
                };
            if (els.settingsBurnContainerSelect) els.settingsBurnContainerSelect.value = n.burnContainer;
            if (els.settingsBurnAudioModeSelect) els.settingsBurnAudioModeSelect.value = n.burnAudioMode;
            if (els.settingsBurnCrf) els.settingsBurnCrf.value = String(n.burnCrf);
            if (els.settingsBurnResolutionSelect) els.settingsBurnResolutionSelect.value = n.burnResolutionId;
            if (els.settingsBurnFpsSelect) els.settingsBurnFpsSelect.value = n.burnFpsId;
            if (els.settingsBurnEncodeSpeedSelect) els.settingsBurnEncodeSpeedSelect.value = n.burnEncodeSpeedId;
            if (els.settingsBurnOutputSuffix) els.settingsBurnOutputSuffix.value = n.burnOutputSuffix;
            if (els.settingsBurnOutputDirInput) els.settingsBurnOutputDirInput.value = n.burnOutputDir;
            void refreshSettingsBurnEncoderSelect(n.burnEncoderId);
        }

        async function refreshSettingsBurnEncoderSelect(selectedId) {
            const sel = els.settingsBurnEncoderSelect;
            if (!sel) return;
            const burn = (global && global.TransubSubtitleBurnCore) || {};
            let list = Array.isArray(burn.ENCODER_PRESETS) && burn.ENCODER_PRESETS.length
                ? burn.ENCODER_PRESETS
                : [{ id: 'libx264', label: '软件 x264', pro: false }];
            try {
                const res = await electron?.ffmpegBurnListEncoders?.({});
                if (res?.ok && Array.isArray(res.encoders) && res.encoders.length) {
                    list = res.encoders;
                }
            } catch (_) { /* keep defaults */ }
            const want = String(selectedId || sel.value || 'libx264').trim() || 'libx264';
            const entitled = !!getAdvancedEntitled();
            sel.innerHTML = list.map((p) => {
                const id = String(p.id || '').trim();
                if (!id) return '';
                const locked = !!p.pro && !entitled;
                const label = locked ? `${p.label || id}（Pro）` : (p.label || id);
                return `<option value="${id.replace(/"/g, '&quot;')}"${id === want ? ' selected' : ''}>${String(label)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')}</option>`;
            }).join('');
            if (![...sel.options].some((o) => o.value === want)) {
                const opt = document.createElement('option');
                opt.value = want;
                opt.textContent = want;
                sel.appendChild(opt);
            }
            sel.value = want;
        }

        async function browseSettingsBurnOutputDir() {
            const res = await electron?.selectFolder?.({
                title: '选择字幕烧录输出目录',
                defaultPath: els.settingsBurnOutputDirInput?.value?.trim() || undefined,
            });
            if (res?.ok && !res.canceled && res.path && els.settingsBurnOutputDirInput) {
                els.settingsBurnOutputDirInput.value = res.path;
                markSettingsDirty(true);
                setSaveParamsStatus('有未保存更改', 'warn');
            }
        }

        function clearSettingsBurnOutputDir() {
            if (!els.settingsBurnOutputDirInput) return;
            els.settingsBurnOutputDirInput.value = '';
            markSettingsDirty(true);
            setSaveParamsStatus('有未保存更改', 'warn');
        }

        return {
            applyBurnSettingsToForm,
            refreshSettingsBurnEncoderSelect,
            browseSettingsBurnOutputDir,
            clearSettingsBurnOutputDir,
        };
    }

    return { createBurnSettingsUi };
}));
