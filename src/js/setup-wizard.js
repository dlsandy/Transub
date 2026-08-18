/**
 * Transub 设置向导：检测硬件 / 确认需求 → 自动写入基础配置。
 */
(function (global) {
    const electron = global.__ELECTRON__;

    async function appConfirmMsg(message, options = {}) {
        const fn = global.TransubAppConfirm;
        if (fn) return fn({ message, ...options });
        return window.confirm(message);
    }
    const DISMISS_KEY = 'transub.setupWizard.dismissed';
    const HF_MIRROR = 'https://hf-mirror.com';
    const STEPS = ['goals', 'detect', 'samples', 'runtime', 'network', 'plan', 'apply', 'done'];
    const STEP_TITLES = {
        goals: '你要做什么',
        detect: '检查电脑',
        samples: '常用影片',
        runtime: '听写运行库',
        network: '下载网络',
        plan: '确认推荐',
        apply: '应用设置',
        done: '完成',
    };
    const TASK_LABELS = {
        translate: '外语→中文字幕',
        transcribe: '只要听写',
        dual: '双语字幕',
    };
    const PROFILE_LABELS = {
        speed: '更快',
        balanced: '均衡',
        quality: '更好',
    };
    const LANG_LABELS = {
        auto: '自动检测',
        ja: '日语',
        en: '英语',
        ko: '韩语',
        zh: '中文',
        yue: '粤语',
    };
    const ASR_OPTIONS = [
        { id: 'sensevoice-small', label: 'SenseVoice Small（多语种·推荐）', langs: ['auto', 'ja', 'zh', 'en', 'ko', 'yue'] },
        { id: 'whisper-tiny', label: 'Whisper tiny（最快）', langs: ['auto', 'en', 'ja', 'ko', 'zh', 'yue'] },
        { id: 'whisper-large-v3-turbo', label: 'Whisper large-v3-turbo（可选·高质量）', langs: ['auto', 'en', 'ja', 'ko', 'zh', 'yue'] },
        { id: 'whisper-large-v2', label: 'Whisper large-v2（可选·经典）', langs: ['auto', 'en', 'ja', 'ko', 'zh', 'yue'] },
        { id: 'whisper-large-v3', label: 'Whisper large-v3（最高质量）', langs: ['auto', 'en', 'ja', 'ko', 'zh', 'yue'] },
        { id: 'anime-whisper', label: 'Anime Whisper（动画/Galgame）', langs: ['ja', 'auto'] },
        { id: 'whisper-ja-1.5b', label: 'Whisper JA 1.5B（日语微调）', langs: ['ja', 'auto'] },
        { id: 'kotoba-whisper-v2.0-faster', label: 'Kotoba Whisper v2.0（日语）', langs: ['ja', 'auto'] },
        { id: 'reazonspeech-k2', label: 'ReazonSpeech K2（日语·带时间戳）', langs: ['ja', 'auto'] },
        { id: 'qwen3-asr-0.6b', label: 'Qwen3-ASR 0.6B（多语·VAD 时间戳）', langs: ['auto', 'ja', 'zh', 'en'] },
        { id: 'qwen3-asr-1.7b-ja-anime-galgame', label: 'Qwen3-ASR 1.7B JA Anime/Galgame（可选·约4GB）', langs: ['ja', 'auto'] },
        { id: 'qwen3-asr-1.7b-ja', label: 'Qwen3-ASR 1.7B JA neosophie（可选·专有名词）', langs: ['ja', 'auto', 'en'] },
    ];
    /** Preferred JA specialized ASR when Sakura / soft-AV needs a Whisper JA model. */
    const WHISPER_JA_PRIMARY = 'whisper-ja-1.5b';
    const WHISPER_JA_IDS = [
        'whisper-ja-1.5b',
        'kotoba-whisper-v2.0-faster',
        'anime-whisper',
    ];
    /** @deprecated use WHISPER_JA_PRIMARY / isWhisperJaId */
    const WHISPER_JA_ID = WHISPER_JA_PRIMARY;

    function isWhisperJaId(id) {
        return WHISPER_JA_IDS.includes(String(id || '').trim());
    }

    function asrListHasWhisperJa(ids = []) {
        return (ids || []).some((id) => isWhisperJaId(id));
    }
    const SAMPLE_MAX = 5;
    const OPUS_MT_OPTIONS = [
        { id: 'opus-mt-ja-zh', label: 'Opus-MT 日→中（机器翻译）', langs: ['ja', 'auto'], kind: 'engine' },
        { id: 'opus-mt-en-zh', label: 'Opus-MT 英→中（机器翻译）', langs: ['en', 'auto', 'yue'], kind: 'engine' },
        { id: 'opus-mt-ko-zh', label: 'Opus-MT 韩→中（机器翻译）', langs: ['ko', 'auto'], kind: 'engine' },
    ];
    const TRANSLATE_PREF_LABELS = {
        engine: '更快更省',
        sakura: '更准',
    };

    function listSakuraMtOptions() {
        const catalog = global.TransubSakuraMtCatalog?.listCatalog?.() || [];
        if (catalog.length) {
            return catalog
                .filter((e) => Number(e.paramBillion || (/7b/i.test(e.id) ? 7 : 1.5)) <= 7)
                .filter((e) => !/14b|32b/i.test(String(e.id)))
                .map((e) => ({
                    id: e.id,
                    label: `${e.name}${e.sizeHint ? ` · ${e.sizeHint}` : ''}（Sakura 日→中）`,
                    langs: ['ja', 'auto'],
                    kind: 'sakura',
                }));
        }
        return [
            { id: 'sakura-1.5b', label: 'Sakura 1.5B（日→中·推理翻译）', langs: ['ja', 'auto'], kind: 'sakura' },
            { id: 'sakura-7b', label: 'Sakura 7B（日→中·推理翻译）', langs: ['ja', 'auto'], kind: 'sakura' },
        ];
    }

    function listGeneralLlmOptions() {
        const api = global.TransubAdvancedManagedLlmCatalog;
        const list = typeof api?.listFreePipelineTranslateModels === 'function'
            ? api.listFreePipelineTranslateModels()
            : (typeof api?.listCatalog === 'function'
                ? api.listCatalog().filter((e) => e.freePipelineTranslate === true)
                : []);
        return list
            .filter((e) => String(e.family || '').toLowerCase() !== 'sakura')
            .filter((e) => !isSakuraModelId(e.id))
            .filter((e) => Number(e.paramBillion || 99) <= 7)
            .map((e) => ({
                id: e.id,
                label: `${e.name}${e.sizeHint ? ` · ${e.sizeHint}` : ''}（通用语言模型）`,
                langs: ['auto', 'ja', 'en', 'ko', 'zh', 'yue'],
                kind: 'llm',
            }));
    }

    function listInferenceMtOptions() {
        return [...listSakuraMtOptions(), ...listGeneralLlmOptions()];
    }

    function allMtOptions() {
        return [...OPUS_MT_OPTIONS, ...listInferenceMtOptions()];
    }

    function isSakuraModelId(id) {
        return /^sakura-/i.test(String(id || ''))
            || !!global.TransubSakuraMtCatalog?.isSakuraMtModel?.(id);
    }

    function isManagedLlmModelId(id) {
        const raw = String(id || '').trim();
        if (!raw || isSakuraModelId(raw) || /^opus-mt-/i.test(raw)) return false;
        const api = global.TransubAdvancedManagedLlmCatalog;
        if (typeof api?.findCatalogEntry === 'function') {
            return !!api.findCatalogEntry(raw);
        }
        return listGeneralLlmOptions().some((o) => o.id === raw);
    }

    /** 未解锁 Pro 仍可用于推理翻译的轻量托管模型（非 Pro 规格）。 */
    function isLightManagedLlmModelId(id) {
        const raw = String(id || '').trim();
        if (!raw || !isManagedLlmModelId(raw)) return false;
        const api = global.TransubAdvancedManagedLlmCatalog;
        if (typeof api?.isProScaleModel === 'function' && api.isProScaleModel(raw)) return false;
        if (typeof api?.isFreePipelineTranslateModel === 'function') {
            return api.isFreePipelineTranslateModel(raw);
        }
        return listGeneralLlmOptions().some((o) => o.id === raw);
    }

    const pageQuery = new URLSearchParams(global.location?.search || '');
    const isStandaloneSettings = pageQuery.get('standaloneSettings') === '1';
    const isStandaloneWizard = pageQuery.get('standaloneWizard') === '1';
    const isWizardHost = isStandaloneSettings || isStandaloneWizard;

    const state = {
        stepIndex: 0,
        applying: false,
        detecting: false,
        fixing: false,
        sensing: false,
        hadSettings: false,
        opening: false,
        detect: {
            gpuOk: false,
            gpuName: '',
            suggestedDevice: 'cpu',
            engineOk: false,
            engineError: '',
            enginePath: '',
            engineUrl: '',
            recommend: null,
            asrWhisperOk: false,
            numpyVersion: '',
            fasterWhisperVersion: '',
            envResult: null,
            runtimeResult: null,
            activeScope: 'base',
        },
        samples: [],
        sense: null,
        applied: {
            device: '',
            profile: '',
            asr: '',
            mt: '',
            language: '',
            task: '',
            openedDownload: false,
        },
        catalogById: {},
        installById: {},
        downloadListSeq: 0,
        applyProgressMeter: { lastBytes: 0, lastAt: 0, speed: 0 },
        applyItemTotal: 0,
        applyItemDone: 0,
    };

    function core() {
        return global.TransubCore;
    }

    async function readAdvancedEntitled() {
        try {
            const res = await electron?.transubAdvancedGetStatus?.();
            return !!(res?.ok && res.status?.entitled);
        } catch {
            return false;
        }
    }

    function $(id) {
        return document.getElementById(id);
    }

    function radioValue(name, fallback) {
        const el = document.querySelector(`input[name="${name}"]:checked`);
        return el ? String(el.value) : fallback;
    }

    function setRadio(name, value) {
        const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
        if (el) el.checked = true;
    }

    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function readCheckedIds(containerId) {
        const host = $(containerId);
        if (!host) return [];
        return [...host.querySelectorAll('input[type="checkbox"][data-model-id]:checked')]
            .map((el) => String(el.getAttribute('data-model-id') || '').trim())
            .filter(Boolean);
    }

    function readGoals() {
        const asrModels = readCheckedIds('wizardAsrList');
        const mtModels = readCheckedIds('wizardMtList');
        return {
            task: radioValue('wizardTask', 'translate'),
            profile: radioValue('wizardProfile', 'balanced'),
            variant: radioValue('wizardVariant', 'simplified'),
            hfMode: radioValue('wizardHf', 'mirror'),
            translatePref: radioValue('wizardTranslatePref', 'engine'),
            language: $('wizardLanguageSelect')?.value || 'auto',
            asrModels,
            mtModels,
            asrModel: asrModels[0] || '',
            mtModel: mtModels[0] || '',
        };
    }

    function hfEndpointFromGoals(goals) {
        return goals.hfMode === 'official' ? '' : HF_MIRROR;
    }

    function defaultAsrFor(language, profile, recommend) {
        const rec = recommend?.models?.asrModel || recommend?.models?.asr_model || '';
        if (rec) return rec;
        if (language === 'ja' && profile === 'quality') return WHISPER_JA_PRIMARY;
        // All profiles default to SenseVoice; whisper-large-v3-turbo is optional.
        return 'sensevoice-small';
    }

    function defaultMtFor(language, task, recommend, translatePref = 'engine') {
        if (task === 'transcribe') return '';
        if (translatePref === 'sakura') {
            if (language === 'ja' || language === 'auto') return 'sakura-1.5b';
            const general = listGeneralLlmOptions();
            return general.find((o) => o.id === 'qwen25-7b')?.id
                || general.find((o) => o.id === 'qwen25-3b')?.id
                || general[0]?.id
                || 'sakura-1.5b';
        }
        const rec = recommend?.models?.mtModel || recommend?.models?.mt_model || '';
        if (rec && language === 'auto' && !isSakuraModelId(rec)) return rec;
        if (language === 'ja') return 'opus-mt-ja-zh';
        if (language === 'en' || language === 'yue') return 'opus-mt-en-zh';
        if (language === 'ko') return 'opus-mt-ko-zh';
        if (language === 'zh') return '';
        return (rec && !isSakuraModelId(rec)) ? rec : 'opus-mt-ja-zh';
    }

    function defaultMtSelection(language, task, recommend, translatePref = 'engine') {
        if (task === 'transcribe') return [];
        if (translatePref === 'sakura') {
            const one = defaultMtFor(language, task, recommend, translatePref);
            return one ? [one] : ['sakura-1.5b'];
        }
        if (language === 'auto') {
            return ['opus-mt-ja-zh', 'opus-mt-en-zh', 'opus-mt-ko-zh'];
        }
        const one = defaultMtFor(language, task, recommend, translatePref);
        return one ? [one] : [];
    }

    function defaultVadFor(asrIds) {
        const list = Array.isArray(asrIds) ? asrIds : [asrIds];
        const ids = new Set();
        list.filter(Boolean).forEach((asrId) => {
            const id = String(asrId || '');
            if (!id || id.includes('sensevoice')) ids.add('fsmn-vad');
            else if (id.includes('whisper')) ids.add('silero-vad');
            else ids.add('fsmn-vad');
        });
        if (!ids.size) ids.add('fsmn-vad');
        // Always install WhisperSeg ASMR (灵敏检出 / 日语软声必装；与默认 VAD 并存)
        ids.add('whisperseg-asmr');
        return [...ids];
    }

    function asrOptionsFor(language) {
        const lang = language || 'auto';
        return ASR_OPTIONS.filter((o) => o.langs.includes(lang) || o.langs.includes('auto'));
    }

    function mtOptionsFor(language, task, translatePref = 'engine') {
        if (task === 'transcribe') return [];
        const lang = language || 'auto';
        if (translatePref === 'sakura') {
            return listInferenceMtOptions().filter((o) => o.langs.includes(lang) || o.langs.includes('auto'));
        }
        return OPUS_MT_OPTIONS.filter((o) => o.langs.includes(lang));
    }

    function mtListHasSakura(ids = readCheckedIds('wizardMtList')) {
        return ids.some((id) => isSakuraModelId(id));
    }

    /** When any Sakura MT is selected, a Whisper JA specialized ASR must stay checked. */
    function enforceWhisperJaForSakura() {
        if (!mtListHasSakura()) return false;
        const host = $('wizardAsrList');
        if (!host) return false;
        if (asrListHasWhisperJa(readCheckedIds('wizardAsrList'))) {
            // Lock whichever JA specialist is already selected.
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
            // Ensure JA option exists even if language filter hid it.
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

    function summaryForList(hostId) {
        if (hostId === 'wizardAsrList') return $('wizardAsrSummary');
        if (hostId === 'wizardMtList') return $('wizardMtSummary');
        return null;
    }

    function refreshDropdownSummary(hostId) {
        const summary = summaryForList(hostId);
        if (!summary) return;
        const ids = readCheckedIds(hostId);
        if (!ids.length) {
            summary.textContent = '请选择模型';
            return;
        }
        const labels = ids.map((id) => modelLabel(id));
        if (labels.length === 1) {
            summary.textContent = `${labels[0]} · 默认`;
            return;
        }
        summary.textContent = `已选 ${labels.length} 项 · 默认 ${labels[0]}`;
        summary.title = labels.map((l, i) => (i === 0 ? `${l}（默认）` : l)).join('\n');
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
        // If nothing checked, check the first option.
        const checks = [...host.querySelectorAll('input[type="checkbox"][data-model-id]')];
        if (checks.length && !checks.some((c) => c.checked)) {
            checks[0].checked = true;
        }
        refreshPrimaryHints(host);
        refreshDropdownSummary(hostId);
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

    function collectDownloadModelIds(goals) {
        const asrList = (goals.asrModels && goals.asrModels.length)
            ? goals.asrModels.slice()
            : [goals.asrModel || defaultAsrFor(goals.language, goals.profile, state.detect.recommend)].filter(Boolean);
        const mtList = goals.task === 'transcribe'
            ? []
            : ((goals.mtModels && goals.mtModels.length)
                ? goals.mtModels
                : defaultMtSelection(goals.language, goals.task, state.detect.recommend, goals.translatePref));
        if (mtList.some((id) => isSakuraModelId(id)) && !asrListHasWhisperJa(asrList)) {
            asrList.unshift(WHISPER_JA_PRIMARY);
        }
        const vadList = defaultVadFor(asrList);
        const ids = [];
        [...asrList, ...mtList, ...vadList].forEach((id) => {
            if (id && !ids.includes(id)) ids.push(id);
        });
        return ids;
    }

    function syncModelSelects({ preserve = true } = {}) {
        const goals = readGoals();
        const sense = senseIsAdopted() ? state.sense : null;
        const lang = $('wizardLanguageSelect')?.value || sense?.language || goals.language || 'auto';
        const profile = $('wizardProfileSelect')?.value || goals.profile;
        const task = radioValue('wizardTask', goals.task);
        const translatePref = radioValue(
            'wizardTranslatePref',
            sense?.translatePref || goals.translatePref || 'engine',
        );
        const mtWrap = $('wizardMtSelectWrap');

        const asrOpts = asrOptionsFor(lang);
        const prevAsr = preserve ? readCheckedIds('wizardAsrList') : [];
        // Sense recommendations win over leftover checkboxes from earlier steps.
        let preferAsr = (sense?.asrModels?.length)
            ? sense.asrModels.filter((id) => asrOpts.some((o) => o.id === id) || isWhisperJaId(id))
            : (prevAsr.length
                ? prevAsr.filter((id) => asrOpts.some((o) => o.id === id) || isWhisperJaId(id))
                : [defaultAsrFor(lang, profile, state.detect.recommend)]);
        if ((translatePref === 'sakura' || sense?.mtModels?.some((id) => isSakuraModelId(id)))
            && !asrListHasWhisperJa(preferAsr)) {
            preferAsr = [WHISPER_JA_PRIMARY, ...preferAsr];
        }
        const asrOptsFinal = (() => {
            const needJa = translatePref === 'sakura'
                || sense?.mtModels?.some((id) => isSakuraModelId(id))
                || asrListHasWhisperJa(preferAsr)
                || mtListHasSakura(preserve ? readCheckedIds('wizardMtList') : (sense?.mtModels || []));
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
                    : defaultMtSelection(lang, task, state.detect.recommend, translatePref));
            // Sense may recommend a Sakura id while options list is still loading; keep id visible.
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
                    emptyText: translatePref === 'sakura'
                        ? '无可用的推理翻译 / 语言模型'
                        : '当前语种无需翻译模型',
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
            return { device: 'cpu', lines: ['硬件检测失败，将默认使用 CPU，你可稍后在设置中修改。'] };
        }
        const data = info.info || info;
        if (data.vendor === 'nvidia' && data.detected) {
            const name = data.gpuName || 'NVIDIA GPU';
            const bits = [`检测到 NVIDIA 显卡：${name}`];
            if (data.driverVersion) bits.push(`驱动 ${data.driverVersion}`);
            if (data.cudaVersion) bits.push(`驱动 CUDA ${data.cudaVersion}`);
            bits.push('建议使用 GPU（CUDA）；若显存不足可改选 CPU。');
            return { device: 'cuda', lines: bits };
        }
        if (data.vendor === 'amd' && data.detected) {
            return {
                device: 'cpu',
                lines: [
                    `检测到 AMD 显卡：${data.gpuName || 'AMD GPU'}`,
                    '当前 Engine 主路径为 NVIDIA CUDA，建议先用 CPU；有 CUDA 设备时可再改。',
                ],
            };
        }
        return {
            device: 'cpu',
            lines: ['未检测到可用的 NVIDIA GPU，建议使用 CPU。'],
        };
    }

    function enginePayloadFromForm() {
        const pathInput = $('engineInstallPathInput');
        const urlInput = $('engineUrlInput');
        const autoStart = $('engineAutoStartCheck');
        return {
            // Empty → main process resolves to vendored transub-engine/
            engineInstallPath: pathInput?.value.trim() || state.detect.enginePath || '',
            engineUrl: urlInput?.value.trim() || state.detect.engineUrl || 'http://127.0.0.1:8765',
            engineHfEndpoint: hfEndpointFromGoals(readGoals()),
            engineAutoStart: autoStart ? !!autoStart.checked : true,
        };
    }

    function renderProgress() {
        const host = $('setupWizardProgress');
        if (!host) return;
        host.innerHTML = STEPS.map((_, i) => {
            const cls = i < state.stepIndex ? 'done' : (i === state.stepIndex ? 'active' : '');
            return `<span class="wizard-progress-dot ${cls}"></span>`;
        }).join('');
    }

    function syncVariantVisibility() {
        const task = radioValue('wizardTask', 'translate');
        const wrap = $('wizardVariantFieldset');
        wrap?.classList.toggle('hidden', task === 'transcribe');
        const prefWrap = $('wizardTranslatePrefFieldset');
        prefWrap?.classList.toggle('hidden', task === 'transcribe');
    }

    function showStep(index) {
        closeAllModelDropdowns();
        state.stepIndex = Math.max(0, Math.min(STEPS.length - 1, index));
        const id = STEPS[state.stepIndex];
        document.querySelectorAll('#setupWizardModal .wizard-step').forEach((el) => {
            el.classList.toggle('active', el.dataset.wizardStep === id);
        });
        if ($('setupWizardStepLabel')) {
            $('setupWizardStepLabel').textContent = `步骤 ${state.stepIndex + 1} / ${STEPS.length} · ${STEP_TITLES[id] || ''}`;
        }
        renderProgress();

        const backBtn = $('setupWizardBackBtn');
        const nextBtn = $('setupWizardNextBtn');
        const skipBtn = $('setupWizardSkipBtn');
        const busy = state.applying || state.detecting || state.fixing || state.sensing;
        if (backBtn) {
            backBtn.disabled = state.stepIndex === 0 || id === 'apply' || busy;
            backBtn.classList.toggle('invisible', id === 'done');
        }
        if (skipBtn) {
            skipBtn.classList.toggle('hidden', id === 'done' || id === 'apply');
            skipBtn.textContent = state.hadSettings ? '取消' : '稍后';
        }
        if (nextBtn) {
            if (id === 'done') {
                nextBtn.textContent = '完成';
                nextBtn.disabled = false;
            } else if (id === 'plan') {
                nextBtn.textContent = '应用并继续';
                const asrIds = readCheckedIds('wizardAsrList');
                const mtIds = readCheckedIds('wizardMtList');
                const asrOk = asrIds.length > 0;
                const sakuraOk = !mtIds.some((mid) => isSakuraModelId(mid)) || asrListHasWhisperJa(asrIds);
                nextBtn.disabled = !asrOk || !sakuraOk;
            } else if (id === 'apply') {
                nextBtn.textContent = '请稍候…';
                nextBtn.disabled = true;
            } else if (id === 'samples') {
                nextBtn.textContent = state.samples.length ? '下一步' : '跳过';
                nextBtn.disabled = !!state.sensing;
            } else if (id === 'detect' || id === 'runtime') {
                nextBtn.textContent = '下一步';
                // Stay clickable when check failed — onNext prompts to fix first.
                nextBtn.disabled = !!busy;
            } else {
                nextBtn.textContent = '下一步';
                nextBtn.disabled = false;
            }
        }

        if (id === 'detect') void runDetect({ scope: 'base' });
        if (id === 'runtime') void runDetect({ scope: 'runtime' });
        if (id === 'samples') renderSampleStep();
        if (id === 'plan') {
            applySenseToPlanForm();
            syncModelSelects({ preserve: true });
            renderPlanCard();
            void refreshDownloadModelList();
        }
        if (id === 'goals') syncVariantVisibility();
    }

    function envApi() {
        return global.TransubEnvCheck;
    }

    function detectScopeFromStep(stepId) {
        return stepId === 'runtime' ? 'runtime' : 'base';
    }

    function detectUi(scope) {
        const runtime = scope === 'runtime';
        return {
            scope: runtime ? 'runtime' : 'base',
            list: $(runtime ? 'setupWizardRuntimeList' : 'setupWizardDetectList'),
            status: $(runtime ? 'setupWizardRuntimeStatus' : 'setupWizardDetectStatus'),
            fixHint: $(runtime ? 'setupWizardRuntimeFixHint' : 'setupWizardFixHint'),
            fixBtn: $(runtime ? 'setupWizardRuntimeFixBtn' : 'setupWizardFixBtn'),
            manualBtn: $(runtime ? 'setupWizardRuntimeManualBtn' : 'setupWizardManualBtn'),
            retryBtn: $(runtime ? 'setupWizardRuntimeRetryBtn' : 'setupWizardRetryDetectBtn'),
            resultKey: runtime ? 'runtimeResult' : 'envResult',
            waitMessage: runtime ? '正在按听写推荐检查运行库…' : '正在检查本机依赖…',
            checkingText: runtime ? '正在检查听写运行库…' : '正在检查依赖项…',
        };
    }

    function getDetectResult(scope) {
        return scope === 'runtime' ? state.detect.runtimeResult : state.detect.envResult;
    }

    function setDetectResult(scope, result) {
        if (scope === 'runtime') state.detect.runtimeResult = result;
        else state.detect.envResult = result;
    }

    /** Prefer adopted sample sense ASR; else goals / hardware default. */
    function resolveWizardAsrHint() {
        if (senseIsAdopted() && state.sense) {
            const fromSense = state.sense.asrModels?.[0]
                || state.sense.patch?.engineAsrModel
                || '';
            if (fromSense) return String(fromSense).trim();
        }
        const goals = readGoals();
        return goals.asrModel
            || defaultAsrFor(goals.language, goals.profile, state.detect.recommend)
            || 'sensevoice-small';
    }

    /** Base / runtime step: proceed only after a successful scoped env check. */
    function detectAllowsNext(scope = detectScopeFromStep(STEPS[state.stepIndex])) {
        if (state.detecting || state.fixing) return false;
        return !!getDetectResult(scope)?.ok;
    }

    function setDetectBusy(busy, scope = state.detect.activeScope || 'base') {
        const ui = detectUi(scope);
        if (ui.retryBtn) ui.retryBtn.disabled = !!busy;
        envApi()?.applyFixButtons?.(ui.fixBtn, ui.manualBtn, getDetectResult(scope), {
            busy: !!busy,
            fixing: state.fixing,
        });
        const nextBtn = $('setupWizardNextBtn');
        const stepId = STEPS[state.stepIndex];
        if (nextBtn && (stepId === 'detect' || stepId === 'runtime')) {
            nextBtn.disabled = !!busy;
        }
    }

    /** When detect/runtime failed: ask user to fix before continuing; offer one-click fix. */
    async function promptDetectFixBeforeNext(scope) {
        const result = getDetectResult(scope);
        const fails = (result?.items || []).filter((it) => it.status === 'fail');
        const names = fails.map((it) => it.label).filter(Boolean).join('、');
        const message = names
            ? `以下项未通过：${names}。\n请先完成修复后再继续。`
            : '检测未通过，请先完成修复后再继续。';
        const vis = envApi()?.computeFixVisibility?.(result)
            || { showFix: !!result?.fix?.fixable };

        if (vis.showFix) {
            const ok = await appConfirmMsg(message, {
                title: '请先修复依赖',
                primaryLabel: '一键修复',
                secondaryLabel: '返回',
            });
            if (ok) void runWizardFix(scope);
            return;
        }

        await appConfirmMsg(
            vis.showManual
                ? `${message}\n可使用「手动下载」安装缺失项。`
                : message,
            {
                title: '请先修复依赖',
                primaryLabel: '知道了',
                hideSecondary: true,
            },
        );
    }

    function setDetectWaitVisible(visible, message) {
        const el = $('setupWizardDetectWait');
        if (!el) return;
        el.classList.toggle('hidden', !visible);
        el.setAttribute('aria-busy', visible ? 'true' : 'false');
        const msg = $('setupWizardDetectWaitMessage');
        if (message && msg) msg.textContent = message;
        const closeBtn = $('setupWizardCloseBtn');
        if (closeBtn) closeBtn.disabled = !!visible;
        const skipBtn = $('setupWizardSkipBtn');
        if (skipBtn) skipBtn.disabled = !!visible;
    }

    async function runDetect(opts = {}) {
        const duringFix = !!opts.duringFix;
        const scope = opts.scope === 'runtime' ? 'runtime' : 'base';
        // Mid-fix recheck must run; only block unrelated detects while fixing.
        if (state.fixing && !duringFix) return getDetectResult(scope);
        const api = envApi();
        const ui = detectUi(scope);
        state.detect.activeScope = scope;
        state.detecting = true;
        setDetectBusy(true, scope);
        setDetectWaitVisible(true, duringFix ? '正在重新检测，请稍候…' : ui.waitMessage);
        if (ui.status) ui.status.textContent = ui.checkingText;
        const placeholderItems = (api?.itemsForScope?.(scope) || api?.DEFAULT_ITEMS || [])
            .map((it) => ({ ...it, status: 'checking' }));
        api?.renderItemsInto?.(ui.list, placeholderItems);

        let result = null;
        try {
            const goals = readGoals();

            // Prefer vendored engine when the settings field is still empty.
            try {
                const pathInput = $('engineInstallPathInput');
                if (pathInput && !pathInput.value.trim()) {
                    const bundled = await electron?.transubEngineBundledPath?.();
                    if (bundled?.ok && bundled.present && bundled.path) {
                        pathInput.value = bundled.path;
                        state.detect.enginePath = bundled.path;
                    }
                }
            } catch { /* ignore */ }

            const payload = enginePayloadFromForm();
            state.detect.enginePath = payload.engineInstallPath;
            state.detect.engineUrl = payload.engineUrl;

            const asrHint = scope === 'runtime'
                ? resolveWizardAsrHint()
                : (goals.asrModel
                    || defaultAsrFor(goals.language, goals.profile, state.detect.recommend)
                    || 'sensevoice-small');
            const checkPayload = {
                engineInstallPath: payload.engineInstallPath,
                engineAsrModel: asrHint,
                syncLlamaBackend: scope === 'base',
                scope,
            };
            if (api?.performEnvCheck) {
                result = await api.performEnvCheck(checkPayload);
            } else {
                try {
                    result = await electron?.transubEnvCheck?.(checkPayload);
                } catch (err) {
                    result = { ok: false, error: err?.message || String(err), items: [], fix: { fixable: false } };
                }
            }

            setDetectResult(scope, result);
            api?.renderItemsInto?.(ui.list, result?.items || []);
            if (ui.status) {
                ui.status.textContent = api?.summarizeCheckResult?.(result)
                    || (result?.ok ? '检测完成。' : '检测未通过，请先修复后再继续。');
            }

            // Hardware / engine summary comes from the base check (or full).
            if (scope === 'base') {
                const items = result?.items || [];
                const gpuItem = items.find((it) => it.id === 'gpu');
                const gpuRuntime = items.find((it) => it.id === 'gpuRuntime');
                const engineItem = items.find((it) => it.id === 'engine');

                state.detect.gpuOk = gpuItem?.status === 'ok';
                state.detect.gpuName = String(gpuItem?.detail || '').split('·')[0].trim();
                const cudaReady = state.detect.gpuOk && gpuRuntime?.status === 'ok';
                state.detect.suggestedDevice = cudaReady ? 'cuda' : (state.detect.gpuOk ? 'cuda' : 'cpu');
                if (state.detect.gpuOk && gpuRuntime?.status === 'warn') {
                    // NVIDIA present but cuBLAS missing — still allow choosing GPU.
                    state.detect.suggestedDevice = 'cuda';
                }
                state.detect.engineOk = engineItem?.status === 'ok';
                state.detect.engineError = state.detect.engineOk ? '' : (engineItem?.detail || result?.error || '引擎未就绪');

                state.detect.recommend = null;
                if (state.detect.engineOk) {
                    try {
                        const rec = await electron?.transubEngineRecommend?.({
                            ...payload,
                            engineProfile: goals.profile,
                            engineHfEndpoint: hfEndpointFromGoals(goals),
                        });
                        if (rec?.ok) state.detect.recommend = rec;
                    } catch { /* ignore */ }
                }

                const deviceSel = $('wizardDeviceSelect');
                if (deviceSel) deviceSel.value = state.detect.suggestedDevice;
                const profileSel = $('wizardProfileSelect');
                if (profileSel) profileSel.value = goals.profile;
            } else {
                const items = result?.items || [];
                const whisperItem = items.find((it) => it.id === 'whisperRuntime');
                state.detect.asrWhisperOk = whisperItem?.status === 'ok';
                state.detect.numpyVersion = '';
                state.detect.fasterWhisperVersion = '';
                if (whisperItem?.detail) {
                    const np = String(whisperItem.detail).match(/numpy\s+([\d.]+)/i);
                    const fw = String(whisperItem.detail).match(/faster-whisper\s+([\d.]+|ok)/i);
                    if (np) state.detect.numpyVersion = np[1];
                    if (fw) state.detect.fasterWhisperVersion = fw[1];
                }
            }

            syncModelSelects({ preserve: false });
        } finally {
            state.detecting = false;
            // Keep detect buttons busy while one-click fix is still running.
            setDetectBusy(!!state.fixing, scope);
            setDetectWaitVisible(false);
        }
        return result;
    }

    async function runWizardFix(scope = state.detect.activeScope || detectScopeFromStep(STEPS[state.stepIndex])) {
        const api = envApi();
        const ui = detectUi(scope);
        if (!api?.runAutoFixSession || state.detecting || state.fixing) return;
        state.detect.activeScope = scope;
        await api.runAutoFixSession({
            getResult: () => getDetectResult(scope),
            setResult: (r) => { setDetectResult(scope, r); },
            setSubtitle: (t) => {
                if (ui.status) ui.status.textContent = t;
            },
            setBusy: (b) => setDetectBusy(b, scope),
            setFixHintVisible: (v) => {
                if (ui.fixHint) ui.fixHint.classList.toggle('hidden', !v);
            },
            fixBtn: ui.fixBtn,
            manualBtn: ui.manualBtn,
            fixHintEl: ui.fixHint,
            downloadPayload: {
                engineInstallPath: enginePayloadFromForm().engineInstallPath,
                engineUrl: enginePayloadFromForm().engineUrl,
            },
            setFixing: (v) => { state.fixing = !!v; },
            isFixing: () => state.fixing,
            isRunning: () => state.detecting,
            recheck: async (opts) => {
                if (opts?.duringFix) {
                    if (ui.status) ui.status.textContent = '本轮修复完成，正在重新检测…';
                }
                return runDetect({ duringFix: !!opts?.duringFix, scope });
            },
            onDone: () => {
                state.fixing = false;
                setDetectBusy(false, scope);
            },
        });
    }

    async function runWizardManual(scope = state.detect.activeScope || detectScopeFromStep(STEPS[state.stepIndex])) {
        const api = envApi();
        const ui = detectUi(scope);
        if (!api?.runManualDownloadSession) return;
        if (state.fixing && api.requestFixSwitchToManual?.()) return;
        if (state.detecting || state.fixing) return;
        state.detect.activeScope = scope;
        await api.runManualDownloadSession({
            getResult: () => getDetectResult(scope),
            setSubtitle: (t) => {
                if (ui.status) ui.status.textContent = t;
            },
            recheck: () => runDetect({ scope }),
        });
    }

    function basenamePath(p) {
        const s = String(p || '').replace(/\\/g, '/');
        const i = s.lastIndexOf('/');
        return i >= 0 ? s.slice(i + 1) : s;
    }

    function isWizardMediaPath(filePath, file) {
        const media = global.TransubMediaExtensions;
        const path = String(filePath || '').trim();
        if (path && media?.isMediaExt?.(path)) return true;
        const mime = String(file?.type || '').toLowerCase();
        if (media?.isMediaMimeType?.(mime)) return true;
        if (mime.startsWith('video/') || mime.startsWith('audio/')) return true;
        const name = String(file?.name || path || '');
        return !!(name && media?.isMediaExt?.(name));
    }

    function pathFromWizardFile(file) {
        if (!file) return '';
        if (file.path) return file.path;
        return electron?.getPathForFile?.(file) || '';
    }

    function pathsFromWizardDataTransfer(dt) {
        const paths = [];
        if (!dt) return paths;
        if (dt.items?.length) {
            for (const item of dt.items) {
                if (item.kind !== 'file') continue;
                const file = item.getAsFile();
                const p = pathFromWizardFile(file);
                if (p && isWizardMediaPath(p, file)) paths.push(p);
            }
            if (paths.length) return paths;
        }
        for (const file of dt.files || []) {
            const p = pathFromWizardFile(file);
            if (p && isWizardMediaPath(p, file)) paths.push(p);
        }
        return paths;
    }

    function renderSampleStep() {
        renderSampleList();
        renderSampleResultCard();
        const clearBtn = $('setupWizardSampleClearBtn');
        if (clearBtn) clearBtn.classList.toggle('hidden', !state.samples.length);
        const nextBtn = $('setupWizardNextBtn');
        if (nextBtn && STEPS[state.stepIndex] === 'samples') {
            nextBtn.textContent = state.samples.length ? '下一步' : '跳过';
            nextBtn.disabled = !!state.sensing;
        }
    }

    function renderSampleList() {
        const host = $('setupWizardSampleList');
        if (!host) return;
        if (!state.samples.length) {
            host.innerHTML = '';
            return;
        }
        host.innerHTML = state.samples.map((s) => {
            const tone = s.status === 'done'
                ? 'text-emerald-700'
                : (s.status === 'error' ? 'text-red-700' : 'text-gray-600');
            const icon = s.status === 'done'
                ? 'fa-check-circle'
                : (s.status === 'error' ? 'fa-times-circle' : 'fa-spinner fa-spin');
            const tag = s.tag ? `<span class="text-gray-500"> · ${esc(s.tag)}</span>` : '';
            return (
                `<li class="flex gap-2 ${tone}">`
                + `<i class="fa ${icon} mt-0.5 shrink-0"></i>`
                + `<span class="min-w-0"><span class="font-medium truncate block">${esc(s.name)}</span>`
                + `<span class="text-[11px] text-gray-500">${esc(s.message || '')}${tag}</span></span></li>`
            );
        }).join('');
    }

    function renderSampleResultCard() {
        const wrap = $('setupWizardSampleResult');
        const summary = $('setupWizardSampleSummary');
        if (!wrap || !summary) return;
        if (!state.sense || !state.samples.length) {
            wrap.classList.add('hidden');
            return;
        }
        wrap.classList.remove('hidden');
        summary.textContent = state.sense.summary || '';
    }

    async function addSamplePaths(paths) {
        const incoming = (paths || []).filter(Boolean);
        if (!incoming.length) return;
        const existing = new Set(state.samples.map((s) => s.path));
        for (const p of incoming) {
            if (existing.has(p)) continue;
            if (state.samples.length >= SAMPLE_MAX) break;
            state.samples.push({
                path: p,
                name: basenamePath(p),
                status: 'pending',
                message: '等待分析…',
                tag: '',
                durationSec: 0,
                language: '',
                classification: null,
            });
            existing.add(p);
        }
        renderSampleStep();
        await senseSamples();
    }

    function clearSamples() {
        state.samples = [];
        state.sense = null;
        const status = $('setupWizardSampleStatus');
        if (status) status.textContent = '';
        renderSampleStep();
    }

    /**
     * Deep language prior for wizard samples — same stack as main-window 深度感知.
     * Never trust bare container `eng` over AV 番号 / filename priors.
     */
    async function resolveWizardSampleLanguage({
        samplePath,
        metaLanguage = '',
        durationSec = 0,
        formLang = 'auto',
        nameClassification = null,
        profileApi = null,
        senseFinalizeApi = null,
        lidBudget = { used: 0, max: SAMPLE_MAX },
    } = {}) {
        const senseHints = {
            profile: nameClassification?.profile,
            profileConfidence: nameClassification?.confidence,
            profileConfident: false,
            strongAv: !!nameClassification?.strongAv,
            forceDeep: true,
        };
        const planned = senseFinalizeApi?.planSenseLanguagePrior?.({
            formLang,
            metaRaw: metaLanguage,
            itemPath: samplePath,
            senseHints,
            backend: 'transub',
            hasDetectApi: !!(state.detect.engineOk && electron?.transubEngineDetectLanguage),
            senseBase: { language: formLang || 'auto' },
            profileApi,
        }) || { done: true, prior: { language: formLang || 'auto', source: 'form', confidence: 0 } };

        if (planned.done) return planned.prior || { language: 'auto', source: 'form', confidence: 0 };

        if (!planned.needSniff
            || lidBudget.used >= lidBudget.max
            || !electron?.transubEngineDetectLanguage) {
            const fallback = planned.pathPrior;
            if (fallback?.language) {
                return {
                    language: fallback.language,
                    source: fallback === planned.nameGuess ? 'name' : 'meta',
                    confidence: fallback.confidence,
                    reason: fallback.reason,
                };
            }
            return { language: 'auto', source: 'form', confidence: 0 };
        }

        const sniffWin = profileApi?.resolveSenseSniffWindow?.({
            durationSec,
            windowSec: 12,
        }) || { startSec: 0, durationSec: 12, reason: '片头区', skippedIntro: false };

        let sniffRes = null;
        let sniffError = '';
        try {
            sniffRes = await electron.transubEngineDetectLanguage({
                mediaPath: samplePath,
                durationSec: sniffWin.durationSec,
                startSec: sniffWin.startSec,
                ...enginePayloadFromForm(),
            });
            lidBudget.used += 1;
        } catch (err) {
            sniffError = err?.message || String(err);
        }

        const after = senseFinalizeApi?.resolveSenseLanguagePriorAfterSniff?.({
            sniffRes,
            sniffWin,
            pathPrior: planned.pathPrior,
            metaGuess: planned.metaGuess,
            nameGuess: planned.nameGuess,
            senseHints,
            profileApi,
            sniffError,
        });
        return after?.prior || planned.pathPrior || { language: 'auto', source: 'form', confidence: 0 };
    }

    async function senseSamples() {
        if (state.sensing || !state.samples.length) return;
        state.sensing = true;
        renderSampleStep();
        const status = $('setupWizardSampleStatus');
        if (status) status.textContent = '正在深度分析样片…';
        const goals = readGoals();
        const profileApi = global.TransubContentProfile;
        const senseFinalizeApi = global.TransubSenseFinalize;
        const lidBudget = { used: 0, max: SAMPLE_MAX };
        const formLang = String(goals.language || 'auto').trim().toLowerCase() || 'auto';

        for (const sample of state.samples) {
            sample.status = 'running';
            sample.message = '深度探测中…';
            renderSampleList();
            try {
                let durationSec = 0;
                let metaLanguage = '';
                try {
                    const probed = await electron?.ffmpegProbe?.({ path: sample.path });
                    if (probed?.ok) {
                        durationSec = Number(probed.duration) || 0;
                        metaLanguage = String(probed.language || probed.audioLanguages?.[0] || '').trim();
                    }
                } catch { /* ignore */ }
                sample.durationSec = durationSec;

                const nameClassification = profileApi?.classifyContentProfile?.({
                    path: sample.path,
                    fileName: sample.name,
                    durationSec,
                    language: formLang,
                    task: goals.task,
                }) || null;

                sample.message = '深度语种探测中…';
                renderSampleList();
                const langPrior = await resolveWizardSampleLanguage({
                    samplePath: sample.path,
                    metaLanguage,
                    durationSec,
                    formLang,
                    nameClassification,
                    profileApi,
                    senseFinalizeApi,
                    lidBudget,
                });
                let language = (langPrior?.language && langPrior.language !== 'auto')
                    ? String(langPrior.language)
                    : '';
                // Soft-AV: drop exotic/wrong tags (nn/en…) so Anime Whisper + JA MT win.
                if (profileApi?.coerceLanguageForSoftAv) {
                    language = profileApi.coerceLanguageForSoftAv(language, {
                        strongAv: !!nameClassification?.strongAv,
                        profile: nameClassification?.profile || '',
                    }) || language;
                }

                let sense = profileApi?.resolveItemSense?.(
                    {
                        path: sample.path,
                        fileName: sample.name,
                        durationSec,
                    },
                    {
                        language: language || 'auto',
                        task: goals.task,
                    },
                    { autoSense: true },
                ) || null;

                // Deep acoustic when filename is not already decisive (same gate as main deep path,
                // but without force — strong AV keeps its recipe).
                const profile = sense?.classification?.profile || nameClassification?.profile || 'unknown';
                const strongAv = !!(sense?.classification?.strongAv || nameClassification?.strongAv);
                if (electron?.ffmpegProbeAcoustic
                    && profileApi?.shouldProbeAcoustic?.({
                        profile,
                        strongAv,
                        confidence: sense?.classification?.confidence || nameClassification?.confidence,
                    })) {
                    sample.message = '声学探测中…';
                    renderSampleList();
                    try {
                        const acWin = profileApi.resolveSenseSniffWindow?.({
                            durationSec,
                            windowSec: 12,
                        }) || { startSec: 0, durationSec: 12 };
                        const acoustic = await electron.ffmpegProbeAcoustic({
                            path: sample.path,
                            durationSec: acWin.durationSec,
                            startSec: acWin.startSec,
                        });
                        if (acoustic && (acoustic.ok || acoustic.hint) && profileApi.applyAcousticHints) {
                            const ac = profileApi.applyAcousticHints(
                                { ...(sense?.overrides || {}) },
                                acoustic,
                                {
                                    profile,
                                    language: language || 'auto',
                                },
                            );
                            if (ac?.overrides && sense) {
                                sense = {
                                    ...sense,
                                    overrides: ac.overrides,
                                };
                            }
                        }
                    } catch { /* ignore acoustic failure */ }
                }

                if (profileApi?.promoteClassificationFromEvidence
                    && profileApi.resolveSenseFromClassification) {
                    const promo = profileApi.promoteClassificationFromEvidence(
                        sense?.classification || nameClassification,
                        {
                            language: language || langPrior?.language,
                            languageConfidence: langPrior?.confidence || 0,
                            durationSec,
                            path: sample.path,
                            strongAv,
                            avLikely: strongAv
                                || /软声/.test(String(langPrior?.reason || '')),
                        },
                    );
                    if (promo?.promoted && promo.classification) {
                        const rebuilt = profileApi.resolveSenseFromClassification(
                            promo.classification,
                            {
                                language: language || 'auto',
                                task: goals.task,
                            },
                            { autoSense: true },
                        );
                        if (rebuilt) sense = rebuilt;
                    }
                }

                sample.language = language || sense?.overrides?.language || '';
                sample.classification = sense?.classification || nameClassification;
                sample.languagePrior = langPrior || null;
                sample.status = 'done';
                const label = sample.classification?.label || '未识别';
                const langLabel = LANG_LABELS[sample.language] || sample.language || '';
                sample.tag = [langLabel, label].filter(Boolean).join(' · ');
                sample.message = sense?.message || (langLabel ? `深度识别为 ${sample.tag}` : '分析完成');
            } catch (err) {
                sample.status = 'error';
                sample.message = err?.message || '分析失败';
            }
            renderSampleList();
        }

        // Batch consensus + model refine
        const batch = profileApi?.classifyBatchContentProfile?.(
            state.samples.map((s) => ({
                path: s.path,
                fileName: s.name,
                durationSec: s.durationSec,
            })),
            { language: 'auto', task: goals.task },
        ) || { profile: 'unknown', mixed: false, label: '未识别', confidence: 0 };

        const langVotes = {};
        state.samples.forEach((s) => {
            const lang = String(s.language || s.classification?.overrides?.language || '').trim();
            if (!lang || lang === 'auto') return;
            langVotes[lang] = (langVotes[lang] || 0) + 1;
        });
        let bestLang = 'auto';
        let bestLangCount = 0;
        Object.entries(langVotes).forEach(([lang, n]) => {
            if (n > bestLangCount) {
                bestLang = lang;
                bestLangCount = n;
            }
        });
        if (batch.mixed || bestLangCount === 0) bestLang = 'auto';
        if (batch.profile === 'av_soft' && profileApi?.coerceLanguageForSoftAv) {
            bestLang = profileApi.coerceLanguageForSoftAv(bestLang, {
                strongAv: true,
                profile: 'av_soft',
            }) || 'ja';
        }

        const advancedEntitled = await readAdvancedEntitled();
        let overrides = profileApi?.optionPatchForProfile?.(batch.profile, {
            task: goals.task,
            advancedEntitled,
        }) || {};
        if (bestLang && bestLang !== 'auto') overrides.language = bestLang;

        try {
            let installedModels = [];
            if (state.detect.engineOk && electron?.transubEngineListModels) {
                const listed = await electron.transubEngineListModels(enginePayloadFromForm());
                const raw = listed?.models || listed?.installed || listed?.items || listed?.info?.models || [];
                installedModels = Array.isArray(raw) ? raw : [];
            }
            if (profileApi?.refineSenseModels) {
                const refined = profileApi.refineSenseModels(overrides, {
                    profile: batch.profile,
                    language: bestLang,
                    task: goals.task,
                    installedModels,
                    device: state.detect?.suggestedDevice || 'cuda',
                    vramGb: Number(state.detect?.recommend?.vramGb
                        || state.detect?.recommend?.vram_gb
                        || (Number(state.detect?.recommend?.vramMb) > 0
                            ? Number(state.detect.recommend.vramMb) / 1024
                            : NaN)) || undefined,
                    hwProfile: state.detect?.recommend?.profile || '',
                });
                // refineSenseModels returns { overrides, notes } — not a flat patch.
                if (refined?.overrides && typeof refined.overrides === 'object') {
                    overrides = refined.overrides;
                }
            }
        } catch { /* ignore */ }

        // Prefer patch models; if refine stripped ASR because nothing is installed yet,
        // fall back to profile defaults so the wizard can still preselect & download them.
        if (!overrides.engineAsrModel) {
            const fallbackPatch = profileApi?.optionPatchForProfile?.(batch.profile, {
                task: goals.task,
                advancedEntitled,
            }) || {};
            if (fallbackPatch.engineAsrModel) overrides.engineAsrModel = fallbackPatch.engineAsrModel;
            if (!overrides.engineMtModel && fallbackPatch.engineMtModel) {
                overrides.engineMtModel = fallbackPatch.engineMtModel;
            }
        }
        if (!overrides.engineAsrModel) {
            overrides.engineAsrModel = defaultAsrFor(
                bestLang || 'auto',
                goals.profile,
                state.detect.recommend,
            );
        }
        if (!overrides.engineMtModel && goals.task !== 'transcribe') {
            const mtFallback = defaultMtFor(
                bestLang || 'auto',
                goals.task,
                state.detect.recommend,
                isSakuraModelId(overrides.engineMtModel) ? 'sakura' : goals.translatePref,
            );
            if (mtFallback) overrides.engineMtModel = mtFallback;
        }

        const asrId = String(overrides.engineAsrModel || '').trim();
        const mtId = String(overrides.engineMtModel || '').trim();
        const wantSakura = isSakuraModelId(mtId);
        const translatePref = wantSakura
            ? 'sakura'
            : (goals.translatePref || 'engine');

        const bits = [];
        if (batch.mixed) {
            bits.push('片子类型不太一样，语言先设为「自动」');
        } else if (batch.profile && batch.profile !== 'unknown') {
            bits.push(`类型：${batch.label || batch.profile}`);
        }
        bits.push(`语言：${LANG_LABELS[bestLang] || bestLang}`);
        if (asrId) bits.push(`听写：${modelLabel(asrId)}`);
        if (mtId && goals.task !== 'transcribe') {
            bits.push(`翻译：${modelLabel(mtId)}`);
        }
        if (!state.detect.engineOk) {
            bits.push('（未做语音语种探测）');
        }

        state.sense = {
            adopted: true,
            mixed: !!batch.mixed,
            profileHint: batch.profile,
            language: bestLang,
            translatePref,
            asrModels: asrId ? [asrId] : [],
            mtModels: mtId && goals.task !== 'transcribe' ? [mtId] : [],
            patch: { ...overrides },
            summary: `根据你的片子，建议：${bits.join(' · ')}`,
            lidUsed: lidBudget.used > 0,
        };
        const adopt = $('wizardSenseAdopt');
        if (adopt) adopt.checked = true;

        state.sensing = false;
        if (status) {
            status.textContent = state.sense.summary
                ? '分析完成，下一步将按推荐检查听写运行库。'
                : '分析完成。';
        }
        renderSampleStep();
    }

    function senseIsAdopted() {
        if (!state.sense) return false;
        const adopt = $('wizardSenseAdopt');
        if (adopt) return !!adopt.checked;
        return !!state.sense.adopted;
    }

    function applySenseToPlanForm() {
        if (!senseIsAdopted() || !state.sense) return;
        const s = state.sense;
        if (s.language && $('wizardLanguageSelect')) {
            $('wizardLanguageSelect').value = s.language;
        }
        if (s.translatePref) {
            setRadio('wizardTranslatePref', s.translatePref);
        }
        // Actual checklist rendering is done by syncModelSelects (reads state.sense).
    }

    function renderPlanCard() {
        const goals = readGoals();
        const device = $('wizardDeviceSelect')?.value || state.detect.suggestedDevice || 'cpu';
        const profile = $('wizardProfileSelect')?.value || goals.profile;
        const asrList = goals.asrModels?.length
            ? goals.asrModels
            : [defaultAsrFor(goals.language, profile, state.detect.recommend)];
        const mtList = goals.task === 'transcribe'
            ? []
            : (goals.mtModels?.length
                ? goals.mtModels
                : defaultMtSelection(goals.language, goals.task, state.detect.recommend, goals.translatePref));
        const host = $('setupWizardPlanCard');
            if (host) {
            const lines = [
                `任务：${TASK_LABELS[goals.task] || goals.task}`,
                `片子语言：${LANG_LABELS[goals.language] || goals.language}`,
                `计算：${device === 'cuda' ? '显卡加速' : '仅用 CPU'} · ${PROFILE_LABELS[profile] || profile}`,
            ];
            if (goals.task !== 'transcribe') {
                lines.push(`翻译：${TRANSLATE_PREF_LABELS[goals.translatePref] || goals.translatePref}`);
            }
            if (asrList[0]) lines.push(`听写：${modelLabel(asrList[0])}`);
            if (mtList[0]) lines.push(`翻译模型：${modelLabel(mtList[0])}`);
            if (senseIsAdopted()) lines.push('已采纳样片推荐');
            else if (!state.detect.engineOk) lines.push('转写引擎待配置');
            host.innerHTML = lines.map((l) => `<div>${esc(l)}</div>`).join('');
        }
        const hint = $('setupWizardPlanHint');
        const needsJa = mtList.some((id) => isSakuraModelId(id));
        const hasJa = asrListHasWhisperJa(asrList);
        if (hint) {
            if (!asrList.length) {
                hint.textContent = '请至少选择一个听写模型（可在上方「调整模型」中勾选）。';
            } else if (needsJa && !hasJa) {
                hint.textContent = '已选更准翻译：需同时勾选 Anime Whisper 或 Whisper JA。';
            } else if (!state.detect.engineOk) {
                hint.textContent = '转写引擎尚未就绪：仍会保存偏好；可稍后在环境页补齐。';
            } else {
                hint.textContent = '';
            }
        }
        const nextBtn = $('setupWizardNextBtn');
        if (nextBtn && STEPS[state.stepIndex] === 'plan') {
            nextBtn.disabled = !asrList.length || (needsJa && !hasJa);
        }
    }

    function modelLabel(id) {
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

    async function refreshDownloadModelList() {
        const list = $('setupWizardModelList');
        const status = $('setupWizardModelListStatus');
        if (!list) return;
        const seq = ++state.downloadListSeq;
        const goals = readGoals();
        const modelIds = collectDownloadModelIds(goals);
        list.innerHTML = '<li class="text-gray-500 text-xs">正在核对已安装模型…</li>';
        if (status) status.textContent = '';

        let catalog = [];
        try {
            if (electron?.transubEngineDownloadInfo) {
                const info = await electron.transubEngineDownloadInfo({
                    ...enginePayloadFromForm(),
                    profile: goals.profile,
                    modelIds: modelIds.filter((id) => !isManagedLlmModelId(id)),
                    hfEndpoint: hfEndpointFromGoals(goals),
                });
                if (info?.ok && Array.isArray(info.info?.catalog || info.catalog)) {
                    catalog = info.info?.catalog || info.catalog;
                } else if (info?.ok && Array.isArray(info.info?.models)) {
                    catalog = info.info.models;
                }
            }
        } catch { /* offline fallback */ }

        /** @type {Record<string, boolean>} */
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
                ? `待下载 ${need.length} 项`
                : (rows.length ? '均已就绪' : '');
        }
        renderPlanCard();
    }

    function appendApplyLine(text, ok) {
        const host = $('setupWizardApplyList');
        if (!host) return;
        const li = document.createElement('li');
        const tone = ok === true ? 'text-emerald-700' : (ok === false ? 'text-red-700' : 'text-gray-700');
        const icon = ok === true ? 'fa-check-circle' : (ok === false ? 'fa-times-circle' : 'fa-spinner fa-spin');
        li.className = `flex gap-2 ${tone}`;
        li.innerHTML = `<i class="fa ${icon} mt-0.5 shrink-0"></i><span>${esc(text)}</span>`;
        host.appendChild(li);
        return li;
    }

    function setApplyProgress(visible, message, pct, meta = {}) {
        const wrap = $('setupWizardApplyProgressWrap');
        const bar = $('setupWizardApplyProgressBar');
        const text = $('setupWizardApplyProgressText');
        const pctEl = $('setupWizardApplyProgressPct');
        const detailEl = $('setupWizardApplyProgressDetail');
        const status = $('setupWizardApplyStatus');
        if (wrap) wrap.classList.toggle('hidden', !visible);
        if (text && message != null) text.textContent = String(message);
        const n = Number(pct);
        if (Number.isFinite(n)) {
            const clamped = Math.max(0, Math.min(100, Math.round(n)));
            if (bar) bar.style.width = `${clamped}%`;
            if (pctEl) pctEl.textContent = `${clamped}%`;
        }
        const countLine = visible ? updateApplyItemCount(meta, message, pct) : '';
        // Lower line: item count (avoid duplicating the progress message).
        if (status) {
            status.textContent = visible ? (countLine || '') : '';
        }
        if (detailEl) {
            if (!visible) {
                detailEl.textContent = '';
                detailEl.classList.add('hidden');
                state.applyProgressMeter = { lastBytes: 0, lastAt: 0, speed: 0, shownRecv: 0, shownTotal: 0, shownSpeed: 0 };
                state.applyItemDone = 0;
            } else {
                const sizeLine = formatApplyProgressDetail(meta);
                // Always keep a size/speed row during download so the UI does not look empty.
                detailEl.textContent = sizeLine || '已下载 — / 总大小 — · 速度 —';
                detailEl.classList.remove('hidden');
            }
        }
    }

    function beginApplyItemProgress(total) {
        const n = Math.max(0, Number(total) || 0);
        state.applyItemTotal = n;
        state.applyItemDone = 0;
        state.applyProgressMeter = {
            lastBytes: 0, lastAt: 0, speed: 0,
            shownRecv: 0, shownTotal: 0, shownSpeed: 0, phaseKey: '',
        };
        const status = $('setupWizardApplyStatus');
        if (status && n > 0) status.textContent = `已下载 0/${n} 个`;
    }

    function updateApplyItemCount(meta = {}, message = '', pct) {
        const src = meta && typeof meta === 'object' ? meta : {};
        const raw = src.raw && typeof src.raw === 'object' ? src.raw : {};
        const msg = String(message || src.message || src.detail || raw.detail || '');
        const index = Number(src.index ?? raw.index);
        const rawTotal = Number(
            (Number.isFinite(Number(src.itemTotal)) && Number(src.itemTotal) > 0)
                ? src.itemTotal
                : (Number.isFinite(Number(raw.itemTotal)) && Number(raw.itemTotal) > 0)
                    ? raw.itemTotal
                    : (Number(src.total ?? raw.total) < 100 ? (src.total ?? raw.total) : NaN),
        );

        if (Number.isFinite(rawTotal) && rawTotal > 0 && rawTotal < 100) {
            state.applyItemTotal = rawTotal;
        }
        const total = Number(state.applyItemTotal) || 0;
        if (!total) return '';

        let done = Number(state.applyItemDone) || 0;
        if (/GPU\s*[：:]/i.test(msg) || /CUDA|cublas|nvidia-/i.test(msg)) {
            // GPU pre-step: models not started yet.
            done = 0;
        } else if (Number.isFinite(index) && index > 0) {
            if (/已安装|下载完成|已就绪|完成|done/i.test(msg) || Number(pct) >= 100) {
                done = Math.min(total, index);
            } else {
                done = Math.max(0, Math.min(total, index - 1));
            }
        } else if (Number(pct) >= 100) {
            done = total;
        } else if (Number.isFinite(Number(src.done ?? raw.done))) {
            done = Math.max(0, Math.min(total, Number(src.done ?? raw.done)));
        }
        state.applyItemDone = done;
        return `已下载 ${done}/${total} 个`;
    }

    function formatWizardBytes(n) {
        const v = Number(n);
        if (!Number.isFinite(v) || v < 0) return '';
        if (v < 1024) return `${Math.round(v)} B`;
        if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
        if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
        return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    function formatApplyProgressDetail(meta = {}) {
        const src = meta && typeof meta === 'object' ? meta : {};
        const raw = src.raw && typeof src.raw === 'object' ? src.raw : {};
        const phaseKey = [
            src.stage || raw.stage || src.phase || raw.phase || '',
            src.modelId || raw.modelId || '',
            src.index ?? raw.index ?? '',
            /GPU\s*[：:]|CUDA|cublas|nvidia-/i.test(String(
                src.message || src.detail || raw.detail || raw.message || '',
            )) ? 'gpu' : 'other',
        ].join('|');
        let received = Number(
            src.downloadedBytes ?? src.received ?? src.downloaded
            ?? raw.downloadedBytes ?? raw.received ?? raw.downloaded,
        );
        let total = Number(
            src.totalBytes ?? src.totalSize
            ?? raw.totalBytes ?? raw.totalSize,
        );
        // Managed LLM progress uses `total` for bytes; ignore tiny integers that look like model counts.
        if (!(Number.isFinite(total) && total > 0)) {
            const maybeTotal = Number(src.total ?? raw.total);
            if (Number.isFinite(maybeTotal) && maybeTotal >= 1024) total = maybeTotal;
        }
        let speed = Number(
            src.bytesPerSecond ?? src.speed
            ?? raw.bytesPerSecond ?? raw.speed,
        );

        if (!state.applyProgressMeter) {
            state.applyProgressMeter = {
                lastBytes: 0, lastAt: 0, speed: 0,
                shownRecv: 0, shownTotal: 0, shownSpeed: 0, phaseKey: '',
            };
        }
        const meter = state.applyProgressMeter;
        // Reset sticky sizes when the download target changes (GPU ↔ models, next model, …).
        if (phaseKey && meter.phaseKey && phaseKey !== meter.phaseKey) {
            meter.shownRecv = 0;
            meter.shownTotal = 0;
            meter.shownSpeed = 0;
            meter.lastBytes = 0;
            meter.lastAt = 0;
            meter.speed = 0;
        }
        if (phaseKey) meter.phaseKey = phaseKey;

        if (Number.isFinite(received) && received > 0) {
            const now = Date.now();
            if (meter.lastAt && received >= meter.lastBytes) {
                const dt = (now - meter.lastAt) / 1000;
                if (dt >= 0.2) {
                    meter.speed = (received - meter.lastBytes) / dt;
                    meter.lastBytes = received;
                    meter.lastAt = now;
                }
            } else {
                meter.lastBytes = received;
                meter.lastAt = now;
            }
            meter.shownRecv = received;
            if (!(Number.isFinite(speed) && speed > 0) && meter.speed > 0) {
                speed = meter.speed;
            }
        } else if (meter.shownRecv > 0) {
            // Keep last known downloaded size instead of flashing 0 B.
            received = meter.shownRecv;
        }
        if (Number.isFinite(total) && total > 0) {
            // Ignore totals that merely mirror received ("12 MB / 12 MB" while growing).
            const mirrorsRecv = Number.isFinite(received) && received > 0
                && Math.abs(total - received) < Math.max(1024, Math.min(total, received) * 0.02);
            if (mirrorsRecv) {
                total = meter.shownTotal > 0 ? meter.shownTotal : NaN;
            } else {
                // Allow total to rise when the next wheel/model announces a larger size.
                meter.shownTotal = Math.max(meter.shownTotal || 0, total);
                total = meter.shownTotal;
            }
        } else if (meter.shownTotal > 0) {
            total = meter.shownTotal;
        }
        // If accounting briefly overshoots the estimate, raise the shown total once.
        if (Number.isFinite(received) && Number.isFinite(total)
            && received > 0 && total > 0 && received > total * 1.02) {
            total = received;
            meter.shownTotal = Math.max(meter.shownTotal || 0, total);
        }
        if (Number.isFinite(speed) && speed > 0) {
            meter.shownSpeed = speed;
        } else if (meter.shownSpeed > 0 && Number.isFinite(received) && received > 0) {
            speed = meter.shownSpeed;
        }

        const parts = [];
        const hasRecv = Number.isFinite(received) && received > 0;
        const hasTotal = Number.isFinite(total) && total > 0;
        if (hasRecv && hasTotal) {
            parts.push(`${formatWizardBytes(received)} / ${formatWizardBytes(total)}`);
        } else if (hasRecv) {
            parts.push(`已下载 ${formatWizardBytes(received)}`);
        } else if (hasTotal) {
            parts.push(`总大小约 ${formatWizardBytes(total)}`);
        }
        if (Number.isFinite(speed) && speed > 0) {
            parts.push(`${formatWizardBytes(speed)}/s`);
        }
        return parts.join(' · ');
    }

    async function probeInstalledModelIds(modelIds) {
        const ids = (modelIds || []).filter(Boolean);
        /** @type {Record<string, boolean>} */
        const map = { ...state.installById };
        ids.forEach((id) => {
            if (id === 'silero-vad') map[id] = true;
            else if (!(id in map) && state.catalogById[id]) {
                map[id] = !!state.catalogById[id].installed;
            }
        });
        try {
            const engineIds = ids.filter((id) => !isManagedLlmModelId(id));
            if (engineIds.length && electron?.transubEngineDownloadInfo) {
                const goals = readGoals();
                const info = await electron.transubEngineDownloadInfo({
                    ...enginePayloadFromForm(),
                    profile: goals.profile,
                    modelIds: engineIds,
                    hfEndpoint: hfEndpointFromGoals(goals),
                });
                const catalog = info?.info?.catalog || info?.catalog || info?.info?.models || [];
                if (Array.isArray(catalog)) {
                    catalog.forEach((m) => {
                        if (m?.id) map[String(m.id)] = !!m.installed;
                    });
                }
            }
        } catch { /* ignore */ }
        try {
            if (ids.some((id) => isManagedLlmModelId(id)) && electron?.transubAdvancedManagedLlmStatus) {
                const st = await electron.transubAdvancedManagedLlmStatus();
                const models = Array.isArray(st?.managed?.catalog) ? st.managed.catalog
                    : (Array.isArray(st?.managed?.models) ? st.managed.models
                        : (Array.isArray(st?.models) ? st.models : []));
                models.forEach((m) => {
                    if (m?.id) map[String(m.id)] = !!m.installed;
                });
            }
        } catch { /* ignore */ }
        state.installById = { ...state.installById, ...map };
        return map;
    }

    /**
     * Ask whether to redownload already-installed models.
     * @returns {{ force: boolean, modelIds: string[] } | null} null = cancel entirely
     */
    async function resolveRedownloadChoice(selectedIds, installMap) {
        const selected = (selectedIds || []).filter(Boolean);
        const installedIds = selected.filter((id) => id !== 'silero-vad' && installMap[id]);
        if (!installedIds.length) {
            return { force: false, modelIds: selected.filter((id) => id !== 'silero-vad') };
        }
        const needIds = selected.filter((id) => id !== 'silero-vad' && !installMap[id]);
        const preview = installedIds.length <= 3
            ? installedIds.map((id) => modelLabel(id)).join('、')
            : `${installedIds.slice(0, 3).map((id) => modelLabel(id)).join('、')} 等 ${installedIds.length} 项`;
        const single = selected.length === 1 && installedIds.length === 1;
        const redownload = await appConfirmMsg(
            single
                ? `「${modelLabel(installedIds[0])}」已下载。是否重新下载？`
                : (
                    `已有 ${installedIds.length} 个模型已下载（${preview}）。\n\n`
                    + '是否重新下载全部勾选（含已安装）？\n'
                    + '选择「取消」将跳过已安装项，只下载未安装项。'
                ),
            {
                title: single ? '重新下载模型' : '部分模型已安装',
                primaryLabel: '重新下载',
                secondaryLabel: single ? '取消' : '跳过已安装',
            },
        );
        if (redownload) {
            return { force: true, modelIds: selected.filter((id) => id !== 'silero-vad') };
        }
        if (single) return null;
        if (!needIds.length) return { force: false, modelIds: [] };
        return { force: false, modelIds: needIds };
    }

    async function runEngineDownloadsInWizard({ modelIds, force, patch, profile, hfEndpoint }) {
        if (!modelIds.length) return { ok: true, skipped: true };
        if (!state.detect.engineOk) {
            appendApplyLine('跳过引擎模型下载（Engine 未就绪）', false);
            return { ok: false, error: 'engine_not_ready' };
        }
        if (!electron?.transubEngineRunDownload) {
            appendApplyLine('当前环境不支持引擎模型下载', false);
            return { ok: false, error: 'unsupported' };
        }
        appendApplyLine(`下载引擎模型（${modelIds.length} 项）${force ? ' · 强制重下' : ''}…`, null);
        beginApplyItemProgress(modelIds.length);
        setApplyProgress(true, `正在下载：${modelIds.map((id) => modelLabel(id)).join('、')}`, 0);
        let unsub = null;
        try {
            if (electron.onEngineDownloadProgress) {
                unsub = electron.onEngineDownloadProgress((p) => {
                    const pct = Number(p?.pct ?? p?.percent);
                    const msg = p?.message || p?.detail || '下载中…';
                    setApplyProgress(true, msg, Number.isFinite(pct) ? pct : undefined, {
                        ...(p || {}),
                        itemTotal: modelIds.length,
                    });
                });
            }
            const res = await electron.transubEngineRunDownload({
                engineInstallPath: patch.engineInstallPath,
                engineUrl: patch.engineUrl,
                engineHfEndpoint: hfEndpoint,
                engineAutoStart: true,
                kind: 'models',
                profile,
                modelIds,
                hfEndpoint,
                force: !!force,
            });
            if (res?.ok) {
                const msg = res.message || '引擎模型下载完成';
                state.applyItemDone = modelIds.length;
                setApplyProgress(true, msg, 100, { done: modelIds.length, itemTotal: modelIds.length });
                appendApplyLine(msg, true);
                return { ok: true };
            }
            if (res?.cancelled) {
                appendApplyLine(res.error || '已取消引擎模型下载', false);
                return { ok: false, cancelled: true };
            }
            appendApplyLine(res?.error || '引擎模型下载失败', false);
            return { ok: false, error: res?.error || 'download_failed' };
        } catch (err) {
            appendApplyLine(err?.message || '引擎模型下载失败', false);
            return { ok: false, error: err?.message || String(err) };
        } finally {
            try { unsub?.(); } catch (_) { /* ignore */ }
        }
    }

    async function runManagedDownloadsInWizard({ modelIds, force }) {
        if (!modelIds.length) return { ok: true, skipped: true };
        if (!electron?.transubAdvancedManagedLlmPull) {
            appendApplyLine('当前环境不支持语言模型下载', false);
            return { ok: false, error: 'unsupported' };
        }
        appendApplyLine(`下载语言模型（${modelIds.length} 项）${force ? ' · 强制重下' : ''}…`, null);
        beginApplyItemProgress(modelIds.length);
        let unsub = null;
        try {
            if (electron.onAdvancedManagedLlmProgress) {
                unsub = electron.onAdvancedManagedLlmProgress((p) => {
                    const pct = Number(p?.pct ?? p?.percent);
                    const msg = p?.message || '下载中…';
                    setApplyProgress(true, msg, Number.isFinite(pct) ? pct : undefined, {
                        ...(p || {}),
                        itemTotal: modelIds.length,
                    });
                });
            }
            // 先按本机 CUDA 对齐并检查/更新 llama-server（缺失、过旧、后端不一致）
            try {
                const st = await electron.transubAdvancedManagedLlmStatus?.();
                const runtime = st?.managed?.runtime || st?.runtime || {};
                const preferredId = String(
                    runtime.preferredPackageId || runtime.package?.id || '',
                ).trim();
                const needRuntime = !runtime.available
                    || !!runtime.outdated
                    || !!runtime.mismatch;
                if (needRuntime && electron.transubAdvancedManagedLlmInstallRuntime) {
                    const tip = !runtime.available
                        ? (preferredId
                            ? `安装 llama-server 运行时（${preferredId}）…`
                            : '安装 llama-server 运行时…')
                        : (runtime.mismatch
                            ? (preferredId
                                ? `重新安装 llama-server（切换至 ${preferredId}）…`
                                : '重新安装 llama-server（后端不一致）…')
                            : `更新 llama-server（${runtime.installedTag || '旧版'} → ${runtime.tag || '最新'}）…`);
                    appendApplyLine(tip, null);
                    setApplyProgress(true, tip, 0, { itemTotal: modelIds.length });
                    const rt = await electron.transubAdvancedManagedLlmInstallRuntime({
                        force: true,
                        runtimeId: preferredId || undefined,
                    });
                    if (rt?.ok) {
                        appendApplyLine(rt.message || 'llama-server 运行时已就绪', true);
                    } else {
                        appendApplyLine(
                            `运行时安装失败：${rt?.error || '未知错误'}（仍继续下载模型）`,
                            false,
                        );
                    }
                } else if (runtime.available && runtime.installedTag) {
                    appendApplyLine(
                        `llama-server 已就绪（${runtime.installedTag}${runtime.installedPackageId ? ` · ${runtime.installedPackageId}` : ''}）`,
                        true,
                    );
                }
            } catch (err) {
                appendApplyLine(`运行时检查失败：${err?.message || err}（仍继续下载模型）`, false);
            }
            for (let i = 0; i < modelIds.length; i += 1) {
                const id = modelIds[i];
                state.applyItemDone = i;
                setApplyProgress(
                    true,
                    `下载 ${modelLabel(id)}（${i + 1}/${modelIds.length}）…`,
                    Math.round((i / modelIds.length) * 100),
                    { index: i + 1, itemTotal: modelIds.length },
                );
                const res = await electron.transubAdvancedManagedLlmPull({ modelId: id, force: !!force });
                if (res?.ok) {
                    state.applyItemDone = i + 1;
                    setApplyProgress(
                        true,
                        res.already ? `${modelLabel(id)} 已就绪（跳过）` : `${modelLabel(id)} 下载完成`,
                        Math.round(((i + 1) / modelIds.length) * 100),
                        { index: i + 1, itemTotal: modelIds.length, done: i + 1 },
                    );
                    appendApplyLine(
                        res.already
                            ? `${modelLabel(id)} 已就绪（跳过）`
                            : `${modelLabel(id)} 下载完成`,
                        true,
                    );
                } else if (res?.code === 'cancelled' || /cancel/i.test(String(res?.error || ''))) {
                    appendApplyLine(res.error || '已取消语言模型下载', false);
                    return { ok: false, cancelled: true };
                } else {
                    appendApplyLine(res?.error || `${modelLabel(id)} 下载失败`, false);
                    return { ok: false, error: res?.error || 'download_failed' };
                }
            }
            setApplyProgress(true, '语言模型下载完成', 100);
            return { ok: true };
        } catch (err) {
            appendApplyLine(err?.message || '语言模型下载失败', false);
            return { ok: false, error: err?.message || String(err) };
        } finally {
            try { unsub?.(); } catch (_) { /* ignore */ }
        }
    }

    async function applyPlan() {
        if (state.applying) return;

        const goals = readGoals();
        const device = $('wizardDeviceSelect')?.value || state.detect.suggestedDevice || 'cpu';
        const profile = $('wizardProfileSelect')?.value || goals.profile;
        const asrList = goals.asrModels?.length
            ? goals.asrModels.slice()
            : [defaultAsrFor(goals.language, profile, state.detect.recommend)].filter(Boolean);
        const mtList = goals.task === 'transcribe'
            ? []
            : (goals.mtModels?.length
                ? goals.mtModels
                : defaultMtSelection(goals.language, goals.task, state.detect.recommend, goals.translatePref));
        if (mtList.some((id) => isSakuraModelId(id)) && !asrListHasWhisperJa(asrList)) {
            asrList.unshift(WHISPER_JA_PRIMARY);
        }
        const asr = asrList[0] || '';
        const mt = mtList[0] || '';
        const vadList = defaultVadFor(asrList);
        const vad = vadList[0] || 'fsmn-vad';
        const downloadIds = collectDownloadModelIds({
            ...goals,
            asrModels: asrList,
            mtModels: mtList,
            asrModel: asr,
            mtModel: mt,
            profile,
        });
        const hfEndpoint = hfEndpointFromGoals(goals);
        const pathInput = $('engineInstallPathInput');
        const urlInput = $('engineUrlInput');

        if (!asrList.length) {
            const hint = $('setupWizardPlanHint');
            if (hint) hint.textContent = '请至少勾选一个语音识别（ASR）模型。';
            return;
        }
        if (mtList.some((id) => isSakuraModelId(id)) && !asrListHasWhisperJa(asrList)) {
            enforceWhisperJaForSakura();
            const hint = $('setupWizardPlanHint');
            if (hint) hint.textContent = '已勾选 Sakura：必须同时勾选 Whisper JA 1.5B。';
            return;
        }

        // Confirm redownload while still on plan (confirm sits above wizard).
        const engineDownloadIds = downloadIds.filter((id) => !isManagedLlmModelId(id) && id !== 'silero-vad');
        const managedDownloadIds = downloadIds.filter((id) => isManagedLlmModelId(id));
        const allDlIds = [...engineDownloadIds, ...managedDownloadIds];
        let downloadChoice = { force: false, modelIds: allDlIds.slice() };
        if (allDlIds.length) {
            const installMap = await probeInstalledModelIds(allDlIds);
            downloadChoice = await resolveRedownloadChoice(allDlIds, installMap);
            if (downloadChoice == null) {
                const hint = $('setupWizardPlanHint');
                if (hint) hint.textContent = '已取消重新下载。可改选模型后重试，或稍后在环境页下载。';
                return;
            }
        }

        state.applying = true;
        showStep(STEPS.indexOf('apply'));
        const list = $('setupWizardApplyList');
        if (list) list.innerHTML = '';
        const status = $('setupWizardApplyStatus');
        if (status) status.textContent = '';
        setApplyProgress(false);

        const patch = {
            engineBackend: 'transub',
            engineInstallPath: pathInput?.value.trim() || state.detect.enginePath || '',
            engineUrl: urlInput?.value.trim() || state.detect.engineUrl || 'http://127.0.0.1:8765',
            engineHfEndpoint: hfEndpoint,
            engineProfile: profile,
            engineAutoStart: true,
            device,
            task: goals.task,
            language: goals.language || 'auto',
            chineseSubtitleVariant: goals.variant === 'traditional' ? 'traditional' : 'simplified',
            smartTranslate: false,
            smartTranslateFaithfulTone: goals.task !== 'transcribe',
            filmAudioEnhance: false,
            filmVadPreset: false,
        };
        if (senseIsAdopted() && state.sense?.patch && typeof state.sense.patch === 'object') {
            const owned = global.TransubContentProfile?.SENSE_OWNED_KEYS || Object.keys(state.sense.patch);
            owned.forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(state.sense.patch, key)
                    && state.sense.patch[key] !== undefined) {
                    patch[key] = state.sense.patch[key];
                }
            });
            // Prefer explicit plan form language / models over stale patch.
            patch.language = goals.language || patch.language || 'auto';
        }
        if (asr) patch.engineAsrModel = asr;
        const opusPick = mtList.find((id) => id && /^opus-mt-/i.test(id));
        const sakuraPick = mtList.find((id) => isSakuraModelId(id));
        const managedPick = mtList.find((id) => isManagedLlmModelId(id));
        const primaryIsSakura = isSakuraModelId(mt);
        const primaryIsManaged = isManagedLlmModelId(mt);
        const advancedEntitled = await readAdvancedEntitled();
        // Smart translate is Pro-only. Free users may still use light managed LLMs as 推理翻译.
        const enableSmart = primaryIsManaged && advancedEntitled;
        const lightManagedPrimary = primaryIsManaged && isLightManagedLlmModelId(mt);
        const lightManagedPick = managedPick && isLightManagedLlmModelId(managedPick) ? managedPick : '';
        const enableLlm = !enableSmart && (
            primaryIsSakura
            || lightManagedPrimary
            || !!sakuraPick
            || (!!lightManagedPick && !opusPick)
        );
        const llmModelId = primaryIsSakura
            ? mt
            : (lightManagedPrimary
                ? mt
                : (sakuraPick || lightManagedPick || ''));
        if (opusPick) {
            patch.engineOpusMtModel = opusPick;
            if (!enableLlm && !enableSmart) patch.engineMtModel = opusPick;
        }
        if (llmModelId) {
            patch.engineLlmMtModel = llmModelId;
            if (enableLlm && isSakuraModelId(llmModelId)) patch.engineMtModel = llmModelId;
        }
        if (enableSmart) {
            patch.smartTranslate = true;
            patch.engineMtModel = '';
        } else {
            patch.smartTranslate = false;
        }
        if (!advancedEntitled) {
            patch.filmAudioEnhance = false;
            patch.filmVadPreset = false;
        }
        if (vad) patch.engineVadModel = vad;

        appendApplyLine('写入设置…', null);
        try {
            const current = core()?.buildSavedOptionsFromForm?.() || {};
            const merged = { ...current, ...patch };
            core()?.applyOptionsToForm?.(merged, { applyUiMode: false });
            // Ensure translate-mode radios match selected path.
            if (goals.task !== 'transcribe') {
                const sakuraRadio = $('translateModeSakura');
                const engineRadio = $('translateModeEngine');
                const smartRadio = $('translateModeSmart');
                if (enableLlm && sakuraRadio) {
                    sakuraRadio.checked = true;
                    if (engineRadio) engineRadio.checked = false;
                    if (smartRadio) smartRadio.checked = false;
                    if ($('smartTranslateCheck')) $('smartTranslateCheck').checked = false;
                    try {
                        const llmSel = document.getElementById('engineLlmMtModelSelect');
                        if (llmSel && llmModelId) llmSel.value = llmModelId;
                    } catch { /* ignore */ }
                } else if (enableSmart && smartRadio) {
                    smartRadio.checked = true;
                    if (engineRadio) engineRadio.checked = false;
                    if (sakuraRadio) sakuraRadio.checked = false;
                    if ($('smartTranslateCheck')) $('smartTranslateCheck').checked = true;
                } else if (engineRadio) {
                    engineRadio.checked = true;
                    if (sakuraRadio) sakuraRadio.checked = false;
                    if (smartRadio) smartRadio.checked = false;
                    if ($('smartTranslateCheck')) $('smartTranslateCheck').checked = false;
                }
            }
            const toSave = {
                ...(core()?.buildSavedOptionsFromForm?.() || merged),
                saveParams: true,
            };
            const saveRes = await electron?.transWithAiSaveOptions?.(toSave);
            if (!saveRes?.ok) throw new Error(saveRes?.error || '保存失败');

            if (managedPick && electron?.transubAdvancedSaveByok) {
                appendApplyLine('配置软件内语言模型…', null);
                const byok = await electron.transubAdvancedSaveByok({ llmSource: 'managed' });
                if (!byok?.ok) throw new Error(byok?.error || '切换软件内模型失败');
                if (electron.transubAdvancedManagedLlmSelect) {
                    const sel = await electron.transubAdvancedManagedLlmSelect({ modelId: managedPick });
                    if (!sel?.ok) throw new Error(sel?.error || `选用模型失败：${managedPick}`);
                }
                let managedTip = `已选用 ${modelLabel(managedPick)}`;
                if (enableSmart) managedTip += '（智能翻译）';
                else if (enableLlm && (lightManagedPrimary || managedPick === llmModelId)) {
                    managedTip += '（推理翻译）';
                } else if (!advancedEntitled) {
                    managedTip += '（解锁 Pro 后可用于智能翻译）';
                }
                appendApplyLine(managedTip, true);
            }

            appendApplyLine('设置已保存', true);
            state.applied = {
                device,
                profile,
                asr: asr || merged.engineAsrModel || '',
                mt: mt || '',
                language: goals.language || 'auto',
                task: goals.task,
                openedDownload: false,
                downloadCount: downloadIds.length,
            };
            markOnboardingDone();
        } catch (err) {
            appendApplyLine(err?.message || '保存失败', false);
            if (status) status.textContent = '保存失败，可返回上一步重试。';
            state.applying = false;
            const nextBtn = $('setupWizardNextBtn');
            if (nextBtn) {
                nextBtn.textContent = '重试应用';
                nextBtn.disabled = false;
            }
            const backBtn = $('setupWizardBackBtn');
            if (backBtn) backBtn.disabled = false;
            return;
        }

        const toDlEngine = downloadChoice.modelIds.filter((id) => !isManagedLlmModelId(id));
        const toDlManaged = downloadChoice.modelIds.filter((id) => isManagedLlmModelId(id));
        let downloadedOk = false;

        if (!allDlIds.length) {
            appendApplyLine('无需下载模型', true);
        } else if (!downloadChoice.modelIds.length) {
            appendApplyLine('所选模型均已就绪，无需下载', true);
            downloadedOk = true;
        } else {
            let allOk = true;
            if (toDlEngine.length) {
                const eng = await runEngineDownloadsInWizard({
                    modelIds: toDlEngine,
                    force: downloadChoice.force,
                    patch,
                    profile,
                    hfEndpoint,
                });
                if (!eng.ok) allOk = false;
                else downloadedOk = true;
            }
            if (toDlManaged.length) {
                const man = await runManagedDownloadsInWizard({
                    modelIds: toDlManaged,
                    force: downloadChoice.force,
                });
                if (!man.ok) allOk = false;
                else downloadedOk = true;
            }
            if (state.applied) {
                state.applied.openedDownload = downloadedOk;
                state.applied.downloadOk = allOk;
            }
        }

        setApplyProgress(false);
        core()?.updateEnvBanner?.();
        if (status) status.textContent = '完成。';
        state.applying = false;
        finishDoneSummary();
        showStep(STEPS.indexOf('done'));
    }

    function finishDoneSummary() {
        const el = $('setupWizardDoneSummary');
        if (!el) return;
        const a = state.applied;
        const parts = [
            `任务：${TASK_LABELS[a.task] || a.task}`,
            `语言：${LANG_LABELS[a.language] || a.language || '自动'}`,
            `计算：${a.device === 'cuda' ? '显卡' : 'CPU'}`,
            `速度：${PROFILE_LABELS[a.profile] || a.profile}`,
        ];
        if (a.asr) parts.push(`听写：${modelLabel(a.asr)}`);
        if (a.mt) parts.push(`翻译：${modelLabel(a.mt)}`);
        if (a.openedDownload) parts.push('所需文件已下载');
        else if (a.downloadCount) parts.push(`计划下载 ${a.downloadCount} 项`);
        el.textContent = parts.join(' · ');
    }

    function markDismissed() {
        try {
            localStorage.setItem(DISMISS_KEY, '1');
        } catch (_) { /* ignore */ }
    }

    function isDismissed() {
        try {
            return localStorage.getItem(DISMISS_KEY) === '1';
        } catch (_) {
            return false;
        }
    }

    function markOnboardingDone() {
        markDismissed();
        try {
            global.TransubEnvCheck?.markDone?.();
        } catch (_) { /* ignore */ }
        // Fallback if markDone is not exported: write the same key.
        try {
            const key = global.TransubEnvCheck?.DONE_KEY || 'transub.envCheck.done';
            localStorage.setItem(key, '1');
        } catch (_) { /* ignore */ }
    }

    function closeWizard({ dismiss = false } = {}) {
        if (state.applying || state.detecting || state.fixing || state.sensing) return;
        if (dismiss) markDismissed();
        $('setupWizardModal')?.classList.add('hidden');
        if (isStandaloneWizard) {
            try { global.close(); } catch (_) { /* ignore */ }
        }
    }

    async function openWizard({ force = false } = {}) {
        // Outside the dedicated wizard window, always open its own BrowserWindow
        // (do not piggyback on the settings window).
        if (!isStandaloneWizard && electron?.transubOpenSetupWizard) {
            return electron.transubOpenSetupWizard({
                forceWizard: !!force,
            });
        }
        // Backward-compatible fallback if preload only has settings open.
        if (!isStandaloneWizard && electron?.transubOpenSettings) {
            return electron.transubOpenSettings({
                tab: 'runtime',
                wizard: true,
                forceWizard: !!force,
            });
        }

        const modal = $('setupWizardModal');
        if (!modal) return { ok: false, error: 'wizard modal missing' };
        if (!modal.classList.contains('hidden')) return { ok: true, alreadyOpen: true };
        if (state.opening) return { ok: true, busy: true };
        state.opening = true;

        try {
            let exists = false;
            try {
                const res = await electron?.transubHasSettingsFile?.();
                exists = !!res?.exists;
            } catch (_) {
                exists = false;
            }
            state.hadSettings = exists;

            // 仅在非 force（例如设置页内再次点向导）且已有配置时确认。
            if (exists && force !== true) {
                const ok = await appConfirmMsg('检测到已有设置。继续将覆盖设备、档位、任务与模型相关默认项，是否继续？', { title: '设置向导' });
                if (!ok) return { ok: false, cancelled: true };
            }

            const form = core()?.buildSavedOptionsFromForm?.() || {};
            if (form.task) setRadio('wizardTask', form.task);
            if (form.engineProfile) setRadio('wizardProfile', form.engineProfile);
            if (form.chineseSubtitleVariant) setRadio('wizardVariant', form.chineseSubtitleVariant);
            if (form.engineHfEndpoint === '') setRadio('wizardHf', 'official');
            else setRadio('wizardHf', 'mirror');
            if (form.smartTranslate) setRadio('wizardTranslatePref', 'sakura');
            else if (isSakuraModelId(form.engineMtModel) || isSakuraModelId(form.engineLlmMtModel)) {
                setRadio('wizardTranslatePref', 'sakura');
            } else {
                setRadio('wizardTranslatePref', 'engine');
            }
            if (form.language && $('wizardLanguageSelect')) {
                $('wizardLanguageSelect').value = form.language;
            }
            syncVariantVisibility();
            syncModelSelects({ preserve: false });

            state.applying = false;
            state.detecting = false;
            state.fixing = false;
            state.sensing = false;
            state.detect.recommend = null;
            state.detect.envResult = null;
            state.detect.runtimeResult = null;
            state.detect.activeScope = 'base';
            state.samples = [];
            state.sense = null;
            setDetectWaitVisible(false);
            modal.classList.remove('hidden');
            showStep(0);
            return { ok: true };
        } finally {
            state.opening = false;
        }
    }

    function scheduleOpenWizard(opts = {}) {
        const tryOpen = (attempt) => {
            if (typeof global.TransubSetupWizard?.open === 'function') {
                void openWizard(opts);
                return;
            }
            if (attempt >= 20) return;
            setTimeout(() => tryOpen(attempt + 1), 50);
        };
        setTimeout(() => tryOpen(0), 0);
    }

    async function maybeAutoOpen() {
        // First launch: open setup wizard (system check stays manual in settings).
        if (isStandaloneSettings || isStandaloneWizard) return false;
        if (isDismissed()) return false;
        try {
            if (global.TransubEnvCheck?.isDone?.()) return false;
        } catch (_) { /* ignore */ }
        // Returning users already have options on disk — never nag every launch.
        // Also persist dismiss so a one-off OS close of the wizard window sticks.
        try {
            const res = await electron?.transubHasSettingsFile?.();
            if (res?.exists) {
                markOnboardingDone();
                return false;
            }
        } catch (_) { /* ignore */ }
        await openWizard({ force: true });
        return true;
    }

    async function onNext() {
        if (state.detecting || state.fixing || state.sensing) return;
        const id = STEPS[state.stepIndex];
        if (id === 'detect' || id === 'runtime') {
            const scope = detectScopeFromStep(id);
            if (!detectAllowsNext(scope)) {
                await promptDetectFixBeforeNext(scope);
                return;
            }
        }
        if (id === 'done') {
            markOnboardingDone();
            closeWizard({ dismiss: false });
            return;
        }
        if (id === 'plan') {
            await applyPlan();
            return;
        }
        if (id === 'apply') {
            await applyPlan();
            return;
        }
        showStep(state.stepIndex + 1);
    }

    function onBack() {
        if (state.applying || state.fixing || state.sensing) return;
        const id = STEPS[state.stepIndex];
        if (id === 'done' || id === 'apply') return;
        showStep(state.stepIndex - 1);
    }

    function bind() {
        $('openSetupWizardFromParamsBtn')?.addEventListener('click', () => {
            void openWizard({ force: false });
        });
        $('setupWizardCloseBtn')?.addEventListener('click', () => closeWizard({ dismiss: true }));
        $('setupWizardSkipBtn')?.addEventListener('click', () => closeWizard({ dismiss: true }));
        $('setupWizardBackBtn')?.addEventListener('click', onBack);
        $('setupWizardNextBtn')?.addEventListener('click', () => { void onNext(); });
        $('setupWizardRetryDetectBtn')?.addEventListener('click', () => { void runDetect({ scope: 'base' }); });
        $('setupWizardFixBtn')?.addEventListener('click', () => { void runWizardFix('base'); });
        $('setupWizardManualBtn')?.addEventListener('click', () => { void runWizardManual('base'); });
        $('setupWizardRuntimeRetryBtn')?.addEventListener('click', () => { void runDetect({ scope: 'runtime' }); });
        $('setupWizardRuntimeFixBtn')?.addEventListener('click', () => { void runWizardFix('runtime'); });
        $('setupWizardRuntimeManualBtn')?.addEventListener('click', () => { void runWizardManual('runtime'); });
        const onEnvActionClick = (event) => {
            const btn = event.target?.closest?.('[data-env-action-url]');
            if (!btn) return;
            const url = btn.getAttribute('data-env-action-url');
            if (url) void electron?.openExternal?.(url);
        };
        $('setupWizardDetectList')?.addEventListener('click', onEnvActionClick);
        $('setupWizardRuntimeList')?.addEventListener('click', onEnvActionClick);

        const sampleDrop = $('setupWizardSampleDrop');
        const sampleInput = $('setupWizardSampleFileInput');
        $('setupWizardSamplePickBtn')?.addEventListener('click', () => sampleInput?.click());
        sampleInput?.addEventListener('change', () => {
            const paths = [];
            for (const file of sampleInput.files || []) {
                const p = pathFromWizardFile(file);
                if (p && isWizardMediaPath(p, file)) paths.push(p);
            }
            sampleInput.value = '';
            void addSamplePaths(paths);
        });
        if (sampleDrop) {
            ['dragenter', 'dragover'].forEach((type) => {
                sampleDrop.addEventListener(type, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    sampleDrop.classList.add('dragover');
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                });
            });
            ['dragleave', 'drop'].forEach((type) => {
                sampleDrop.addEventListener(type, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (type === 'dragleave') sampleDrop.classList.remove('dragover');
                });
            });
            sampleDrop.addEventListener('drop', (e) => {
                sampleDrop.classList.remove('dragover');
                void addSamplePaths(pathsFromWizardDataTransfer(e.dataTransfer));
            });
        }
        $('setupWizardSampleClearBtn')?.addEventListener('click', () => clearSamples());
        $('wizardSenseAdopt')?.addEventListener('change', () => {
            if (state.sense) state.sense.adopted = !!$('wizardSenseAdopt')?.checked;
            if (STEPS[state.stepIndex] === 'plan') {
                applySenseToPlanForm();
                syncModelSelects({ preserve: true });
                renderPlanCard();
                void refreshDownloadModelList();
            }
        });
        $('setupWizardOpenSettingsBtn')?.addEventListener('click', () => {
            closeWizard({ dismiss: false });
            if (electron?.transubOpenSettings) {
                void electron.transubOpenSettings({ tab: 'install' });
            } else {
                core()?.openParamsModal?.('install');
            }
        });
        $('setupWizardOpenProBtn')?.addEventListener('click', () => {
            closeWizard({ dismiss: false });
            if (electron?.transubOpenSettings) {
                void electron.transubOpenSettings({ tab: 'pro' });
            } else {
                core()?.openParamsModal?.('pro');
            }
        });
        $('setupWizardModal')?.addEventListener('click', (event) => {
            if (isStandaloneWizard) return;
            if (event.target === $('setupWizardModal')) closeWizard({ dismiss: true });
        });
        document.querySelectorAll('input[name="wizardTask"]').forEach((el) => {
            el.addEventListener('change', () => {
                syncVariantVisibility();
                if (STEPS[state.stepIndex] === 'plan') {
                    syncModelSelects({ preserve: false });
                    void refreshDownloadModelList();
                }
            });
        });
        document.querySelectorAll('input[name="wizardTranslatePref"]').forEach((el) => {
            el.addEventListener('change', () => {
                if (STEPS[state.stepIndex] === 'plan' || STEPS[state.stepIndex] === 'goals') {
                    syncModelSelects({ preserve: false });
                    if (STEPS[state.stepIndex] === 'plan') void refreshDownloadModelList();
                }
            });
        });
        $('wizardDeviceSelect')?.addEventListener('change', renderPlanCard);
        $('wizardProfileSelect')?.addEventListener('change', () => {
            setRadio('wizardProfile', $('wizardProfileSelect').value);
            syncModelSelects({ preserve: false });
            void refreshDownloadModelList();
        });
        $('wizardLanguageSelect')?.addEventListener('change', () => {
            syncModelSelects({ preserve: false });
            void refreshDownloadModelList();
        });
        const onModelCheckChange = (event) => {
            const host = event.currentTarget;
            if (!event.target?.matches?.('input[type="checkbox"][data-model-id]')) return;
            if (host?.id === 'wizardMtList') {
                if (mtListHasSakura()) enforceWhisperJaForSakura();
                else clearWhisperJaLock();
            }
            if (host?.id === 'wizardAsrList' && mtListHasSakura()) {
                if (!asrListHasWhisperJa(readCheckedIds('wizardAsrList'))) {
                    const ja = host.querySelector(`input[type="checkbox"][data-model-id="${WHISPER_JA_PRIMARY}"]`);
                    if (ja) {
                        ja.checked = true;
                        ja.disabled = true;
                    }
                }
            }
            refreshPrimaryHints(host);
            void refreshDownloadModelList();
        };
        $('wizardAsrList')?.addEventListener('change', onModelCheckChange);
        $('wizardMtList')?.addEventListener('change', onModelCheckChange);
        const onDdToggle = (event) => {
            const btn = event.currentTarget;
            const dd = btn?.closest?.('.wizard-dd');
            if (!dd) return;
            const willOpen = !dd.classList.contains('open');
            closeAllModelDropdowns(willOpen ? dd : null);
            setDropdownOpen(dd, willOpen);
        };
        $('wizardAsrToggle')?.addEventListener('click', onDdToggle);
        $('wizardMtToggle')?.addEventListener('click', onDdToggle);
        document.addEventListener('click', (event) => {
            const modal = $('setupWizardModal');
            if (!modal || modal.classList.contains('hidden')) return;
            if (event.target?.closest?.('.wizard-dd')) return;
            closeAllModelDropdowns();
        });
        document.addEventListener('keydown', (event) => {
            const modal = $('setupWizardModal');
            if (!modal || modal.classList.contains('hidden')) return;
            // Confirm sits above the wizard; let its Escape handler own the key.
            const confirmEl = $('appConfirmModal');
            if (confirmEl && !confirmEl.classList.contains('hidden')) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                closeWizard({ dismiss: true });
            }
        });

        // Dedicated wizard window: react to main-process focus/reopen events.
        if (isStandaloneWizard && electron?.onOpenSetupWizard) {
            electron.onOpenSetupWizard((payload) => {
                scheduleOpenWizard({ force: payload?.forceWizard !== false });
            });
        }

        // Native window close (title-bar X) bypasses Skip/Close buttons; still
        // persist dismiss so the next app launch does not auto-open again.
        if (isStandaloneWizard) {
            window.addEventListener('pagehide', () => {
                markDismissed();
            });
        }

        // Settings window may still request wizard via onOpenParams (legacy).
        if (isStandaloneSettings && electron?.onOpenParams) {
            electron.onOpenParams((payload) => {
                if (!payload?.wizard) return;
                scheduleOpenWizard({ force: payload.forceWizard !== false });
            });
        }

        // Cold start via ?standaloneWizard=1 or legacy ?wizard=1 inside settings.
        if (isStandaloneWizard) {
            scheduleOpenWizard({ force: pageQuery.get('forceWizard') !== '0' });
        } else if (isStandaloneSettings && pageQuery.get('wizard') === '1') {
            scheduleOpenWizard({ force: pageQuery.get('forceWizard') !== '0' });
        }
    }

    function init() {
        bind();
        // After main UI paints / options load; avoid racing splash.
        setTimeout(() => { void maybeAutoOpen(); }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
    } else {
        setTimeout(init, 0);
    }

    global.TransubSetupWizard = {
        open: openWizard,
        close: closeWizard,
        maybeAutoOpen,
    };
}(window));
