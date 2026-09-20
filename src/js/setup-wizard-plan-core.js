/**
 * TransubSetupWizardPlan — setup wizard extracted core.
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSetupWizardPlan = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function setupWizardPlanFactory(global) {
    /**
     * Plan card, model dropdowns, Sakura↔Whisper-JA gates, download list.
     * @param {object} deps
     */
    function createSetupWizardPlan(deps) {
        const d = deps || {};
        const $ = d.$ || ((id) => (typeof document !== 'undefined' ? document.getElementById(id) : null));
        const electron = d.electron;
        const uiTf = d.uiTf || ((t) => t);
        const uiTx = d.uiTx || ((t) => t);
        const esc = d.esc || ((s) => String(s ?? ''));
        const getState = d.getState || (() => ({}));
        const radioValue = d.radioValue || (() => '');
        const readGoals = d.readGoals || (() => ({}));
        const readCheckedIds = d.readCheckedIds || (() => []);
        const enginePayloadFromForm = d.enginePayloadFromForm || (() => ({}));
        const ensureHfEndpoint = d.ensureHfEndpoint || (async () => ({ hfEndpoint: '' }));
        const getHfEndpoint = d.getHfEndpoint || (() => '');
        const defaultAsrFor = d.defaultAsrFor || (() => 'sensevoice-small');
        const defaultMtSelection = d.defaultMtSelection || (() => []);
        const mtSelectionOpts = d.mtSelectionOpts || (() => ({}));
        const asrOptionsFor = d.asrOptionsFor || (() => []);
        const mtOptionsFor = d.mtOptionsFor || (() => []);
        const collectDownloadModelIds = d.collectDownloadModelIds || (() => []);
        const ASR_OPTIONS = d.ASR_OPTIONS || [];
        const WHISPER_JA_PRIMARY = d.WHISPER_JA_PRIMARY || 'whisper-ja-1.5b';
        const WHISPER_JA_IDS = d.WHISPER_JA_IDS || [];
        const isWhisperJaId = d.isWhisperJaId || (() => false);
        const asrListHasWhisperJa = d.asrListHasWhisperJa || (() => false);
        const isSakuraModelId = d.isSakuraModelId || (() => false);
        const isManagedLlmModelId = d.isManagedLlmModelId || (() => false);
        const allMtOptions = d.allMtOptions || (() => []);
        const TASK_LABELS = d.TASK_LABELS || {};
        const PROFILE_LABELS = d.PROFILE_LABELS || {};
        const LANG_LABELS = d.LANG_LABELS || {};
        const TRANSLATE_PREF_LABELS = d.TRANSLATE_PREF_LABELS || {};
        const senseIsAdopted = d.senseIsAdopted || (() => false);
        const getSteps = d.getSteps || (() => []);

        function summaryForList(hostId) {
            if (hostId === 'wizardAsrList') return $('wizardAsrSummary');
            if (hostId === 'wizardMtList') return $('wizardMtSummary');
            return null;
        }

        function modelLabel(id) {
            const state = getState();
            const fromAsr = ASR_OPTIONS.find((o) => o.id === id);
            if (fromAsr) return fromAsr.label;
            const fromMt = allMtOptions().find((o) => o.id === id);
            if (fromMt) return fromMt.label;
            if (id === 'fsmn-vad') return 'FSMN-VAD（语音活动检测）';
            if (id === 'silero-vad') return 'Silero VAD（随 Whisper 内置）';
            if (id === 'whisperseg-asmr') return 'WhisperSeg ASMR（必装 · 灵敏检出）';
            const cat = state.catalogById[id];
            return cat?.name || id;
        }

        function refreshDropdownSummary(hostId) {
            const summary = summaryForList(hostId);
            if (!summary) return;
            const ids = readCheckedIds(hostId);
            if (!ids.length) {
                summary.textContent = uiTx('请选择模型');
                return;
            }
            const labels = ids.map((id) => modelLabel(id));
            if (labels.length === 1) {
                summary.textContent = uiTf('{name} · 默认', { name: labels[0] });
                return;
            }
            summary.textContent = uiTf('已选 {count} 项 · 默认 {name}', {
                count: labels.length,
                name: labels[0],
            });
            summary.title = labels.map((l, i) => (i === 0 ? uiTf('{name}（默认）', { name: l }) : l)).join('\n');
        }

        function setDropdownOpen(dd, open) {
            if (!dd) return;
            dd.classList.toggle('open', !!open);
            const toggle = dd.querySelector('.wizard-dd-toggle');
            if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        function closeAllModelDropdowns(except) {
            ['wizardAsrDd', 'wizardMtDd'].forEach((id) => {
                const dd = $(id);
                if (!dd || dd === except) return;
                setDropdownOpen(dd, false);
            });
        }

        function refreshPrimaryHints(host) {
            if (!host) return;
            const checks = [...host.querySelectorAll('input[type="checkbox"][data-model-id]')];
            let first = true;
            checks.forEach((input) => {
                const label = input.closest('label');
                const nameSpan = label?.querySelector('span.font-medium');
                if (!nameSpan) return;
                const base = String(nameSpan.textContent || '').replace(/\s*·\s*默认\s*$/, '');
                if (input.checked && first) {
                    nameSpan.innerHTML = `${esc(base)}<span class="text-violet-600"> · 默认</span>`;
                    first = false;
                } else {
                    nameSpan.textContent = base;
                }
            });
            refreshDropdownSummary(host.id);
        }

        function renderModelCheckList(hostId, options, selectedIds, { emptyText = '无可选项' } = {}) {
            const host = $(hostId);
            if (!host) return;
            const selected = new Set((selectedIds || []).filter(Boolean));
            if (!options.length) {
                host.innerHTML = `<p class="text-[11px] text-gray-400 px-1 py-1">${esc(emptyText)}</p>`;
                refreshDropdownSummary(hostId);
                return;
            }
            host.innerHTML = options.map((opt) => {
                const checked = selected.has(opt.id);
                return (
                    `<label>`
                    + `<input type="checkbox" data-model-id="${esc(opt.id)}" class="mt-0.5 shrink-0" ${checked ? 'checked' : ''}>`
                    + `<span><span class="font-medium">${esc(opt.label)}</span>`
                    + `<span class="model-id">${esc(opt.id)}</span></span></label>`
                );
            }).join('');
            const checks = [...host.querySelectorAll('input[type="checkbox"][data-model-id]')];
            if (checks.length && !checks.some((c) => c.checked)) {
                checks[0].checked = true;
            }
            refreshPrimaryHints(host);
            refreshDropdownSummary(hostId);
        }

        function mtListHasSakura(ids = readCheckedIds('wizardMtList')) {
            return ids.some((id) => isSakuraModelId(id));
        }

        function enforceWhisperJaForSakura() {
            if (!mtListHasSakura()) return false;
            const host = $('wizardAsrList');
            if (!host) return false;
            if (asrListHasWhisperJa(readCheckedIds('wizardAsrList'))) {
                for (const jaId of WHISPER_JA_IDS) {
                    const input = host.querySelector(`input[type="checkbox"][data-model-id="${jaId}"]`);
                    if (input?.checked) {
                        input.disabled = true;
                        input.title = '勾选 Sakura 推理翻译时必须使用日语专用 Whisper';
                    }
                }
                refreshPrimaryHints(host);
                return false;
            }
            let input = host.querySelector(`input[type="checkbox"][data-model-id="${WHISPER_JA_PRIMARY}"]`);
            if (!input) {
                const asrOpts = asrOptionsFor('ja');
                const prev = readCheckedIds('wizardAsrList');
                if (!asrListHasWhisperJa(prev)) prev.push(WHISPER_JA_PRIMARY);
                renderModelCheckList('wizardAsrList', asrOpts, prev);
                input = host.querySelector(`input[type="checkbox"][data-model-id="${WHISPER_JA_PRIMARY}"]`);
            }
            if (!input) return false;
            const changed = !input.checked;
            input.checked = true;
            input.disabled = true;
            input.title = '勾选 Sakura 推理翻译时必须使用日语专用 Whisper';
            refreshPrimaryHints(host);
            return changed;
        }

        function clearWhisperJaLock() {
            const host = $('wizardAsrList');
            if (!host) return;
            for (const jaId of WHISPER_JA_IDS) {
                const input = host.querySelector(`input[type="checkbox"][data-model-id="${jaId}"]`);
                if (input) {
                    input.disabled = false;
                    input.title = '';
                }
            }
        }

        function syncModelSelects({ preserve = true } = {}) {
            const state = getState();
            const goals = readGoals();
            const sense = senseIsAdopted() ? state.sense : null;
            const lang = $('wizardLanguageSelect')?.value || sense?.language || goals.language || 'auto';
            const profile = $('wizardProfileSelect')?.value || goals.profile;
            const task = radioValue('wizardTask', goals.task);
            const pipe = (typeof d.resolveWizardPipeline === 'function'
                ? d.resolveWizardPipeline
                : (global.TransubSetupWizardGoals?.resolveWizardPipeline))?.({
                task,
                profile,
                language: lang,
                variant: radioValue('wizardVariant', goals.variant || 'simplified'),
                recommend: state.detect.recommend,
                sense,
                advancedEntitled: !!state.advancedEntitled,
                asrModels: preserve ? readCheckedIds('wizardAsrList') : (sense?.asrModels || []),
                mtModels: preserve ? readCheckedIds('wizardMtList') : (sense?.mtModels || []),
            }) || {
                translatePref: goals.translatePref || 'sakura',
                asrModels: [defaultAsrFor(lang, profile, state.detect.recommend)],
                mtModels: defaultMtSelection(lang, task, state.detect.recommend, 'sakura', '', mtSelectionOpts()),
            };
            const translatePref = pipe.translatePref || 'sakura';
            const mtWrap = $('wizardMtSelectWrap');

            const asrOpts = asrOptionsFor(lang);
            const prevAsr = preserve ? readCheckedIds('wizardAsrList') : [];
            let preferAsr = (sense?.asrModels?.length)
                ? sense.asrModels.filter((id) => asrOpts.some((o) => o.id === id) || isWhisperJaId(id))
                : (prevAsr.length
                    ? prevAsr.filter((id) => asrOpts.some((o) => o.id === id) || isWhisperJaId(id))
                    : (pipe.asrModels || [defaultAsrFor(lang, profile, state.detect.recommend)]));
            if ((translatePref === 'sakura' || sense?.mtModels?.some((id) => isSakuraModelId(id)) || (pipe.mtModels || []).some((id) => isSakuraModelId(id)))
                && !asrListHasWhisperJa(preferAsr)) {
                preferAsr = [WHISPER_JA_PRIMARY, ...preferAsr];
            }
            const asrOptsFinal = (() => {
                const needJa = translatePref === 'sakura'
                    || sense?.mtModels?.some((id) => isSakuraModelId(id))
                    || (pipe.mtModels || []).some((id) => isSakuraModelId(id))
                    || asrListHasWhisperJa(preferAsr)
                    || mtListHasSakura(preserve ? readCheckedIds('wizardMtList') : (sense?.mtModels || pipe.mtModels || []));
                if (!needJa) return asrOpts;
                if (asrOpts.some((o) => isWhisperJaId(o.id))) return asrOpts;
                const ja = ASR_OPTIONS.find((o) => o.id === WHISPER_JA_PRIMARY);
                return ja ? [...asrOpts, ja] : asrOpts;
            })();
            renderModelCheckList(
                'wizardAsrList',
                asrOptsFinal,
                preferAsr.length ? preferAsr : [asrOptsFinal[0]?.id].filter(Boolean),
            );

            const needsMt = task !== 'transcribe';
            mtWrap?.classList.toggle('hidden', !needsMt);
            if (needsMt) {
                const mtOpts = mtOptionsFor(lang, task, translatePref);
                const prevMt = preserve ? readCheckedIds('wizardMtList') : [];
                let preferMt = (sense?.mtModels?.length)
                    ? sense.mtModels.filter((id) => mtOpts.some((o) => o.id === id))
                    : (prevMt.length
                        ? prevMt.filter((id) => mtOpts.some((o) => o.id === id))
                        : (pipe.mtModels || defaultMtSelection(lang, task, state.detect.recommend, translatePref, '', mtSelectionOpts())));
                if (sense?.mtModels?.length && !preferMt.length) {
                    const missing = sense.mtModels.filter((id) => !mtOpts.some((o) => o.id === id));
                    if (missing.length) {
                        missing.forEach((id) => {
                            mtOpts.push({
                                id,
                                label: modelLabel(id),
                                langs: [lang, 'auto'],
                                kind: isSakuraModelId(id) ? 'sakura' : (isManagedLlmModelId(id) ? 'llm' : 'engine'),
                            });
                        });
                        preferMt = sense.mtModels.slice();
                    }
                }
                renderModelCheckList(
                    'wizardMtList',
                    mtOpts,
                    preferMt.filter((id) => mtOpts.some((o) => o.id === id)),
                    {
                        emptyText: '无可用的推理翻译 / 语言模型',
                    },
                );
            } else {
                const mtList = $('wizardMtList');
                if (mtList) mtList.innerHTML = '<p class="text-[11px] text-gray-400 px-1 py-1">听写任务不需要翻译模型</p>';
            }

            if (mtListHasSakura() || translatePref === 'sakura') enforceWhisperJaForSakura();
            else clearWhisperJaLock();
        }

        function describeGpu(info) {
            if (!info || info.ok === false) {
                return {
                    device: 'cpu',
                    lines: [uiTx('硬件检测失败，将默认使用 CPU，你可稍后在设置中修改。')],
                };
            }
            const data = info.info || info;
            if (data.vendor === 'nvidia' && data.detected) {
                const name = data.gpuName || 'NVIDIA GPU';
                const bits = [uiTf('检测到 NVIDIA 显卡：{name}', { name })];
                if (data.driverVersion) bits.push(uiTf('驱动 {ver}', { ver: data.driverVersion }));
                if (data.cudaVersion) bits.push(uiTf('驱动 CUDA {ver}', { ver: data.cudaVersion }));
                bits.push(uiTx('建议使用 GPU（CUDA）；若显存不足可改选 CPU。'));
                return { device: 'cuda', lines: bits };
            }
            if (data.vendor === 'amd' && data.detected) {
                return {
                    device: 'cuda',
                    lines: [
                        uiTf('检测到 AMD 显卡：{name}', { name: data.gpuName || 'AMD GPU' }),
                        uiTx('建议使用 GPU（ROCm）：Qwen3 / SenseVoice 可加速；Whisper 仍走 CPU。软件内大模型可选 ROCm 或 Vulkan。'),
                    ],
                };
            }
            return {
                device: 'cpu',
                lines: [uiTx('未检测到可用的 NVIDIA / AMD GPU，Engine 听写建议使用 CPU。')],
            };
        }

        function syncWizardDeviceSelect() {
            const state = getState();
            const deviceSel = $('wizardDeviceSelect');
            if (!deviceSel) return;
            const amd = state.detect.gpuVendor === 'amd';
            const cudaOpt = deviceSel.querySelector('option[value="cuda"]');
            const cpuOpt = deviceSel.querySelector('option[value="cpu"]');
            if (cudaOpt) {
                cudaOpt.disabled = false;
                cudaOpt.textContent = amd
                    ? uiTx('GPU（AMD · ROCm · Qwen/SenseVoice）')
                    : uiTx('GPU（NVIDIA · Engine 听写）');
            }
            if (cpuOpt) {
                cpuOpt.textContent = uiTx('CPU（Engine 听写）');
            }
            const want = state.detect.suggestedDevice || 'cpu';
            deviceSel.value = want === 'cuda' || want === 'cpu' ? want : 'cpu';
        }

        function renderPlanCard() {
            const state = getState();
            const goals = readGoals();
            const device = $('wizardDeviceSelect')?.value || state.detect.suggestedDevice || 'cpu';
            const profile = $('wizardProfileSelect')?.value || goals.profile;
            const sense = senseIsAdopted() ? state.sense : null;
            const pipe = (typeof d.resolveWizardPipeline === 'function'
                ? d.resolveWizardPipeline
                : (global.TransubSetupWizardGoals?.resolveWizardPipeline))?.({
                task: goals.task,
                profile,
                language: goals.language,
                variant: goals.variant,
                asrModels: goals.asrModels,
                mtModels: goals.mtModels,
                recommend: state.detect.recommend,
                sense,
                advancedEntitled: !!state.advancedEntitled,
            });
            const asrList = goals.asrModels?.length
                ? goals.asrModels
                : (pipe?.asrModels || [defaultAsrFor(goals.language, profile, state.detect.recommend)]);
            const mtList = goals.task === 'transcribe'
                ? []
                : (goals.mtModels?.length
                    ? goals.mtModels
                    : (pipe?.mtModels || defaultMtSelection(goals.language, goals.task, state.detect.recommend, 'sakura', '', mtSelectionOpts())));
            const host = $('setupWizardPlanCard');
            const hfPick = state.hfPick;
            const hfLabel = hfPick?.hfEndpoint
                ? (hfPick.label || hfPick.hfEndpoint)
                : '';
            if (host) {
                const amd = state.detect.gpuVendor === 'amd';
                const computeLabel = device === 'cuda'
                    ? (amd ? 'Engine 听写 · GPU（ROCm）' : 'Engine 听写 · GPU（CUDA）')
                    : 'Engine 听写 · CPU';
                const lines = [
                    `任务：${TASK_LABELS[goals.task] || goals.task}`,
                    `速度：${PROFILE_LABELS[profile] || profile}`,
                    `片子语言：${LANG_LABELS[goals.language] || goals.language}`,
                    `计算：${computeLabel}${
                        amd ? ' · llama-server 可用 ROCm/Vulkan · Whisper 仍 CPU' : ''
                    }`,
                ];
                if (asrList[0]) lines.push(`听写：${modelLabel(asrList[0])}`);
                if (mtList.length > 1) {
                    lines.push(`翻译模型：${mtList.map((id) => modelLabel(id)).join(' + ')}`);
                } else if (mtList[0]) {
                    lines.push(`翻译模型：${modelLabel(mtList[0])}`);
                } else if (goals.task !== 'transcribe') {
                    lines.push('翻译：按语种自动选择');
                }
                if (hfLabel) lines.push(`下载源：${hfLabel}`);
                else lines.push('下载源：进入本步后自动测速');
                if (senseIsAdopted()) lines.push('已采纳样片推荐');
                else if (!state.detect.engineOk) lines.push('转写引擎待配置');
                if (amd && state.detect.gpuName) {
                    lines.push(`显卡：${state.detect.gpuName}（AMD）`);
                }
                if (pipe?.smartTranslate) lines.push('翻译模式：智能翻译（Pro）');
                else if (goals.task !== 'transcribe' && mtList.length) lines.push('翻译模式：推理翻译');
                host.innerHTML = lines.map((l) => `<div>${esc(l)}</div>`).join('');
            }
            const hint = $('setupWizardPlanHint');
            const needsJa = mtList.some((id) => isSakuraModelId(id));
            const hasJa = asrListHasWhisperJa(asrList);
            if (hint) {
                if (!asrList.length) {
                    hint.textContent = uiTx('请至少选择一个听写模型（可在「高级」中勾选）。');
                } else if (needsJa && !hasJa) {
                    hint.textContent = uiTx('已选 Sakura 推理翻译：需同时勾选 Anime Whisper 或 Whisper JA。');
                } else if (!state.detect.engineOk) {
                    hint.textContent = uiTx('转写引擎尚未就绪：仍会保存偏好；可稍后在环境页补齐。');
                } else if (state.detect.gpuVendor === 'amd') {
                    hint.textContent = uiTx('已检测到 AMD 显卡：Qwen3 / SenseVoice 可用 ROCm GPU；Whisper 仍走 CPU。大模型优先 ROCm（也可 Vulkan）。');
                } else {
                    hint.textContent = '';
                }
            }
            const nextBtn = $('setupWizardNextBtn');
            const steps = getSteps();
            if (nextBtn && steps[state.stepIndex] === 'confirm') {
                nextBtn.disabled = !asrList.length || (needsJa && !hasJa);
            }
        }

        async function refreshDownloadModelList() {
            const state = getState();
            const list = $('setupWizardModelList');
            const status = $('setupWizardModelListStatus');
            if (!list) return;
            const seq = ++state.downloadListSeq;
            const goals = readGoals();
            const modelIds = collectDownloadModelIds(goals);
            list.innerHTML = '<li class="text-gray-500 text-xs">正在核对已安装模型…</li>';
            if (status) status.textContent = '';

            let hfEndpoint = getHfEndpoint();
            try {
                const pick = await ensureHfEndpoint();
                if (pick && pick.hfEndpoint != null) hfEndpoint = pick.hfEndpoint;
            } catch { /* ignore */ }

            let catalog = [];
            try {
                if (electron?.transubEngineDownloadInfo) {
                    const info = await electron.transubEngineDownloadInfo({
                        ...enginePayloadFromForm(),
                        profile: goals.profile,
                        modelIds: modelIds.filter((id) => !isManagedLlmModelId(id)),
                        hfEndpoint,
                    });
                    if (info?.ok && Array.isArray(info.info?.catalog || info.catalog)) {
                        catalog = info.info?.catalog || info.catalog;
                    } else if (info?.ok && Array.isArray(info.info?.models)) {
                        catalog = info.info.models;
                    }
                }
            } catch { /* offline fallback */ }

            const managedInstalled = {};
            try {
                if (electron?.transubAdvancedManagedLlmStatus) {
                    const st = await electron.transubAdvancedManagedLlmStatus();
                    const models = Array.isArray(st?.managed?.catalog) ? st.managed.catalog
                        : (Array.isArray(st?.managed?.models) ? st.managed.models
                            : (Array.isArray(st?.models) ? st.models : []));
                    models.forEach((m) => {
                        if (m?.id) managedInstalled[String(m.id)] = !!m.installed;
                    });
                }
            } catch { /* ignore */ }

            if (seq !== state.downloadListSeq) return;

            state.catalogById = {};
            state.installById = {};
            catalog.forEach((m) => {
                if (m?.id) state.catalogById[String(m.id)] = m;
            });

            const rows = modelIds.map((id) => {
                const live = state.catalogById[id] || {};
                let installed = id === 'silero-vad' ? true : !!live.installed;
                if (isManagedLlmModelId(id) && Object.prototype.hasOwnProperty.call(managedInstalled, id)) {
                    installed = !!managedInstalled[id];
                } else if (isManagedLlmModelId(id) && isSakuraModelId(id) === false && live.installed == null) {
                    installed = !!managedInstalled[id];
                }
                const entry = global.TransubAdvancedManagedLlmCatalog?.findCatalogEntry?.(id);
                state.installById[id] = installed;
                return {
                    id,
                    installed,
                    name: live.name || entry?.name || modelLabel(id),
                    sizeHint: live.sizeHint || entry?.sizeHint || '',
                    required: id === 'whisperseg-asmr',
                };
            });
            const need = rows.filter((r) => !r.installed);
            const done = rows.filter((r) => r.installed);

            if (!rows.length) {
                list.innerHTML = '<li class="text-gray-500 text-xs">当前方案无需额外模型</li>';
            } else {
                list.innerHTML = [
                    ...need.map((r) => (
                        `<li class="flex gap-2 text-amber-800"><i class="fa fa-download mt-0.5 shrink-0"></i>`
                        + `<span><span class="font-medium">${esc(r.name)}</span>`
                        + (r.required ? '<span class="ml-1 text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-900">必装</span>' : '')
                        + `<span class="block text-[11px] text-gray-500 font-mono">${esc(r.id)}${r.sizeHint ? ` · ${esc(r.sizeHint)}` : ''}</span></span></li>`
                    )),
                    ...done.map((r) => (
                        `<li class="flex gap-2 text-emerald-700"><i class="fa fa-check-circle mt-0.5 shrink-0"></i>`
                        + `<span><span class="font-medium">${esc(r.name)}</span>`
                        + (r.required ? '<span class="ml-1 text-[10px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-900">必装</span>' : '')
                        + `<span class="block text-[11px] text-gray-500">已安装 · ${esc(r.id)}</span></span></li>`
                    )),
                ].join('');
            }
            if (status) {
                status.textContent = need.length
                    ? uiTf('待下载 {count} 项', { count: need.length })
                    : (rows.length ? uiTx('均已就绪') : '');
            }
            renderPlanCard();
        }

        function refinePlanNextButton(nextBtn) {
            if (!nextBtn) return;
            const goals = readGoals();
            const asrIds = readCheckedIds('wizardAsrList');
            const mtIds = readCheckedIds('wizardMtList');
            const asrOk = asrIds.length > 0;
            const sakuraOk = !mtIds.some((mid) => isSakuraModelId(mid)) || asrListHasWhisperJa(asrIds);
            nextBtn.disabled = !asrOk || !sakuraOk;
            void goals;
        }

        return {
            modelLabel,
            refreshDropdownSummary,
            setDropdownOpen,
            closeAllModelDropdowns,
            refreshPrimaryHints,
            renderModelCheckList,
            mtListHasSakura,
            enforceWhisperJaForSakura,
            clearWhisperJaLock,
            syncModelSelects,
            describeGpu,
            syncWizardDeviceSelect,
            renderPlanCard,
            refreshDownloadModelList,
            refinePlanNextButton,
        };
    }

    return {
        createSetupWizardPlan,
        /** Pure gate helper for tests / chrome. */
        planNextEnabled({ asrIds, mtIds, isSakuraModelId, asrListHasWhisperJa }) {
            const asrOk = Array.isArray(asrIds) && asrIds.length > 0;
            const needsJa = Array.isArray(mtIds) && mtIds.some((id) => isSakuraModelId?.(id));
            const sakuraOk = !needsJa || !!asrListHasWhisperJa?.(asrIds);
            return { asrOk, sakuraOk, enabled: asrOk && sakuraOk, needsJa };
        },
    };

}));
