/**
 * Factory status chips: QC banner, engine-backend visibility, ASR recommend chip.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubFactoryStatusChips = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function factoryStatusChipsFactory(global) {
    /**
     * @param {object} deps shell adapters
     */
    function createFactoryStatusChips(deps) {
        const d = deps || {};
        const els = d.els || {};
        const state = d.state || {};
        const electron = d.electron;
        const postTaskQcApi = d.postTaskQcApi
            || (global && global.TransubPostTaskQcUi)
            || {};

        const countQcIssues = d.countQcIssues || (() => 0);
        const getAdvancedEntitled = d.getAdvancedEntitled || (() => false);
        const readEngineBackendFromForm = d.readEngineBackendFromForm || (() => 'transub');
        const getAsrRecommendDismissedKey = d.getAsrRecommendDismissedKey || (() => '');
        const setAsrRecommendDismissedKey = d.setAsrRecommendDismissedKey || (() => {});
        const getCachedHardwareRecommend = d.getCachedHardwareRecommend || (() => null);
        const syncQuickAsrRecommendChip = d.syncQuickAsrRecommendChip || (() => {});
        const updateReadinessStrip = d.updateReadinessStrip || (() => {});
        const ensureSelectValue = d.ensureSelectValue || (() => {});
        const appendLog = d.appendLog || (() => {});
        const showToast = d.showToast || (() => {});
        const uiTf = d.uiTf || ((s) => s);
        const markSettingsDirty = d.markSettingsDirty || (() => {});

        function updateQcBanner() {
            if (!els.qcBanner) return;
            const vm = postTaskQcApi.buildQcBannerViewModel
                ? postTaskQcApi.buildQcBannerViewModel({
                    issueCount: countQcIssues(),
                    dismissed: !!state.qcBannerDismissed,
                    fixing: !!state.qcFixing,
                    smartFixing: !!state.qcSmartFixing,
                    running: !!state.running,
                    advancedEntitled: !!getAdvancedEntitled(),
                    smartFixAvailable: !!electron?.transubAdvancedQcSmartFix,
                })
                : null;
            if (!vm) {
                els.qcBanner.classList.add('hidden');
                return;
            }
            if (!vm.visible) {
                els.qcBanner.classList.add('hidden');
                return;
            }
            if (els.qcBannerText) els.qcBannerText.textContent = vm.text;
            if (els.qcBannerFixBtn) {
                els.qcBannerFixBtn.disabled = vm.fixDisabled;
                els.qcBannerFixBtn.textContent = vm.fixLabel;
            }
            if (els.qcBannerSmartFixBtn) {
                els.qcBannerSmartFixBtn.classList.toggle('hidden', !vm.smartVisible);
                els.qcBannerSmartFixBtn.disabled = vm.smartDisabled;
                els.qcBannerSmartFixBtn.textContent = vm.smartLabel;
            }
            els.qcBanner.classList.remove('hidden');
        }

        function syncEngineBackendUi() {
            const backend = readEngineBackendFromForm();
            const isTwai = backend === 'twai';
            els.engineSettingsBlock?.classList.toggle('opacity-50', isTwai);
            els.twaiSettingsBlock?.classList.toggle('opacity-50', !isTwai);
            // Format / glossary availability differs by backend
            els.subFormatLrcWrap?.classList.toggle('hidden', !isTwai);
            els.subFormatAssWrap?.classList.toggle('hidden', isTwai);
            els.engineOutputExtrasWrap?.classList.toggle('hidden', isTwai);
            els.glossaryMtWrap?.classList.toggle('hidden', isTwai);
            if (!isTwai && els.subFormatLrc) els.subFormatLrc.checked = false;
            if (isTwai && els.subFormatAss) els.subFormatAss.checked = false;
            if (els.envBannerText) {
                els.envBannerText.textContent = isTwai
                    ? '配置仍指向已冻结的 TransWithAI；请改用 Transub Engine（设置 → 运行环境）。'
                    : '尚未配置 Transub Engine：请在「设置 → 运行环境」检测内置引擎并下载模型。';
            }
        }

        function updateAsrRecommendChip(rec = null) {
            const api = global && global.TransubAsrSettings;
            const chip = els.asrRecommendChip;
            if (!chip || !api?.describeAsrRecommendChip) return;
            const cachedHardwareRecommend = getCachedHardwareRecommend();
            const currentAsr = els.engineAsrModelSelect?.value || '';
            const recommendedAsr = String(
                rec?.models?.asrModel
                || rec?.asrModel
                || cachedHardwareRecommend?.asrModel
                || '',
            ).trim();
            const profile = String(
                rec?.profile || cachedHardwareRecommend?.profile || '',
            ).trim();
            const key = `${recommendedAsr}|${profile}`;
            const dismissedKey = getAsrRecommendDismissedKey();
            if (dismissedKey && dismissedKey === key) {
                chip.classList.add('hidden');
                chip.hidden = true;
                syncQuickAsrRecommendChip();
                return;
            }
            const ui = api.describeAsrRecommendChip({
                currentAsr,
                recommendedAsr,
                profile,
            });
            if (!ui.visible) {
                chip.classList.add('hidden');
                chip.hidden = true;
                syncQuickAsrRecommendChip();
                return;
            }
            if (els.asrRecommendChipLabel) els.asrRecommendChipLabel.textContent = ui.label;
            if (els.asrRecommendChipDetail) els.asrRecommendChipDetail.textContent = ui.detail;
            chip.dataset.recommendedAsr = ui.recommendedAsr || '';
            chip.classList.remove('hidden');
            chip.hidden = false;
            syncQuickAsrRecommendChip();
            updateReadinessStrip();
        }

        function applyAsrRecommendFromChip() {
            const id = String(els.asrRecommendChip?.dataset?.recommendedAsr || '').trim();
            if (!id || !els.engineAsrModelSelect) return;
            ensureSelectValue(els.engineAsrModelSelect, id, { label: id });
            els.engineAsrModelSelect.dispatchEvent(new Event('change'));
            if (els.quickAsrModelSelect) {
                els.quickAsrModelSelect.value = id;
            }
            setAsrRecommendDismissedKey('');
            appendLog(`已应用硬件推荐 ASR：${id}`, 'ok');
            showToast(uiTf('ASR 已切换为 {id}', { id }), 'ok');
            markSettingsDirty(true);
            const cachedHardwareRecommend = getCachedHardwareRecommend();
            updateAsrRecommendChip({
                models: { asrModel: id },
                profile: cachedHardwareRecommend?.profile,
            });
            updateReadinessStrip();
        }

        return {
            updateQcBanner,
            syncEngineBackendUi,
            updateAsrRecommendChip,
            applyAsrRecommendFromChip,
        };
    }

    return { createFactoryStatusChips };
}));
