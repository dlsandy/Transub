/**
 * TWAI model path select UI: fill/refresh selects, browse folders, hint text.
 * Shell injects DOM/IPC via createTwaiModelSelectUi(deps).
 */
(function (global, factory) {
    const api = factory(global);
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTwaiModelSelectUi = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function twaiModelSelectUiFactory() {
    /**
     * @param {object} deps shell adapters
     */
    function createTwaiModelSelectUi(deps) {
        const d = deps || {};
        const els = d.els || {};
        const electron = d.electron;
        const modelApi = d.modelApi || {};
        const esc = d.esc || ((s) => String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;'));
        const uiTf = d.uiTf || ((s) => s);
        const appendLog = d.appendLog || (() => {});
        const readTaskFromForm = d.readTaskFromForm || (() => 'translate');
        const getAdvancedEntitled = d.getAdvancedEntitled || (() => false);
        const updateParamsSummary = d.updateParamsSummary || (() => {});
        const getCachedModelItems = d.getCachedModelItems || (() => []);
        const setCachedModelItems = d.setCachedModelItems || (() => {});

        function kindBadge(kind, item = null) {
            const base = kind === 'transcribe' ? '转写'
                : kind === 'translate' ? '翻译'
                    : kind === 'root' ? '默认'
                        : '其他';
            if (item?.kindSource === 'signature') return `${base}·特征`;
            if (item?.kindSource === 'name') return `${base}·名称`;
            return base;
        }

        function readModelPathFromForm(kind) {
            if (kind === 'translate') {
                return String(els.translateModelPathInput?.value || '').trim();
            }
            return String(els.transcribeModelPathInput?.value || '').trim();
        }

        function syncModelSelectToPath(kind, pathValue) {
            const selectEl = kind === 'translate' ? els.translateModelSelect : els.transcribeModelSelect;
            if (!selectEl) return;
            const want = String(pathValue || '').replace(/\\/g, '/');
            const match = [...selectEl.options].find(
                (opt) => String(opt.value || '').replace(/\\/g, '/') === want,
            );
            if (match) {
                selectEl.value = match.value;
                return;
            }
            if (want) {
                const opt = document.createElement('option');
                opt.value = pathValue;
                opt.textContent = `${pathValue}（自定义）`;
                selectEl.appendChild(opt);
                selectEl.value = pathValue;
                return;
            }
            selectEl.value = '';
        }

        function setModelPathOnForm(kind, pathValue, { syncSelect = true } = {}) {
            const raw = String(pathValue || '').trim();
            const inputEl = kind === 'translate' ? els.translateModelPathInput : els.transcribeModelPathInput;
            if (inputEl) inputEl.value = raw;
            if (syncSelect) syncModelSelectToPath(kind, raw);
        }

        function fillModelSelect(selectEl, items, selectedPath, preferKind) {
            if (!selectEl) return;
            const list = Array.isArray(items) ? items : [];
            const want = String(selectedPath || '').replace(/\\/g, '/');
            const opts = ['<option value="">（自动 / 安装默认）</option>'];
            const sorted = [...list].sort((a, b) => {
                const score = (it) => {
                    if (preferKind && it.kind === preferKind) return 0;
                    if (it.kind === 'root') return 2;
                    return 1;
                };
                return score(a) - score(b) || String(a.label || '').localeCompare(String(b.label || ''));
            });
            for (const it of sorted) {
                const pathVal = String(it.path || '').replace(/\\/g, '/');
                const ready = it.ready !== false ? '' : ' · 不完整';
                const label = `${it.label || pathVal} [${kindBadge(it.kind, it)}]${ready}`;
                const sel = pathVal === want ? ' selected' : '';
                opts.push(`<option value="${esc(pathVal)}"${sel}>${esc(label)}</option>`);
            }
            if (want && !list.some((it) => String(it.path || '').replace(/\\/g, '/') === want)) {
                opts.push(`<option value="${esc(want)}" selected>${esc(want)}（自定义）</option>`);
            }
            selectEl.innerHTML = opts.join('');
            if (want) selectEl.value = want;
            else selectEl.value = '';
        }

        async function refreshModelSelects(options = {}) {
            const installPath = els.installPathInput?.value.trim()
                || options.installPath
                || 'F:\\UltraTools\\TransWithAI';
            let items = [];
            try {
                const res = await electron?.transWithAiListModels?.({ installPath });
                if (res?.ok && Array.isArray(res.items)) items = res.items;
            } catch { /* ignore */ }
            setCachedModelItems(items);

            let transcribePath = options.transcribeModelPath != null
                ? String(options.transcribeModelPath || '').trim()
                : readModelPathFromForm('transcribe');
            let translatePath = options.translateModelPath != null
                ? String(options.translateModelPath || '').trim()
                : readModelPathFromForm('translate');

            if (modelApi.fillMissingModelPaths) {
                const filled = modelApi.fillMissingModelPaths({
                    transcribeModelPath: transcribePath,
                    translateModelPath: translatePath,
                    modelPath: options.modelPath || '',
                }, items);
                transcribePath = filled.transcribeModelPath || '';
                translatePath = filled.translateModelPath || '';
            }

            fillModelSelect(els.transcribeModelSelect, items, transcribePath, 'transcribe');
            fillModelSelect(els.translateModelSelect, items, translatePath, 'translate');
            setModelPathOnForm('transcribe', transcribePath, { syncSelect: false });
            setModelPathOnForm('translate', translatePath, { syncSelect: false });
            syncModelSelectToPath('transcribe', transcribePath);
            syncModelSelectToPath('translate', translatePath);
            updateModelSelectHint();
        }

        /** Auto-correct crossed / wrong-kind model picks using the last listed packages. */
        function applyAutoDetectedModelsFromCache() {
            const cached = getCachedModelItems();
            if (!modelApi.fillMissingModelPaths || !cached.length) return;
            const before = {
                transcribeModelPath: readModelPathFromForm('transcribe'),
                translateModelPath: readModelPathFromForm('translate'),
            };
            const filled = modelApi.fillMissingModelPaths(before, cached);
            const nextTranscribe = filled.transcribeModelPath || '';
            const nextTranslate = filled.translateModelPath || '';
            if (nextTranscribe !== before.transcribeModelPath) {
                setModelPathOnForm('transcribe', nextTranscribe);
                fillModelSelect(els.transcribeModelSelect, cached, nextTranscribe, 'transcribe');
            }
            if (nextTranslate !== before.translateModelPath) {
                setModelPathOnForm('translate', nextTranslate);
                fillModelSelect(els.translateModelSelect, cached, nextTranslate, 'translate');
            }
        }

        async function browseModelPath(kind) {
            const title = kind === 'translate'
                ? '选择翻译模型文件夹'
                : '选择转写模型文件夹';
            const res = await electron?.selectFolder?.({ title });
            if (!res?.ok || res.canceled || !res.path) return;
            const modelPath = String(res.path || '').trim();
            if (!modelPath) return;

            const installPath = els.installPathInput?.value.trim() || '';
            try {
                const check = await electron?.transWithAiValidateModel?.({ installPath, modelPath });
                if (check && check.ok === false) {
                    const warn = check.error || '模型目录可能不完整';
                    appendLog(`${kind === 'translate' ? '翻译' : '转写'}模型：${warn}`, 'info');
                }
            } catch { /* ignore */ }

            setModelPathOnForm(kind, modelPath);
            fillModelSelect(
                kind === 'translate' ? els.translateModelSelect : els.transcribeModelSelect,
                getCachedModelItems(),
                modelPath,
                kind,
            );
            syncModelSelectToPath(kind, modelPath);
            updateModelSelectHint();
            updateParamsSummary();
        }

        function updateModelSelectHint() {
            if (!els.modelSelectHint || !modelApi.validateModelsForTask) return;
            const task = readTaskFromForm();
            const opts = {
                transcribeModelPath: readModelPathFromForm('transcribe'),
                translateModelPath: readModelPathFromForm('translate'),
            };
            const gate = modelApi.validateModelsForTask(opts, getCachedModelItems(), task);
            if (!gate.ok) {
                els.modelSelectHint.textContent = gate.error || '';
                els.modelSelectHint.className = 'text-xs text-red-600 min-h-[1rem]';
                return;
            }
            const warnings = gate.warnings || [];
            if (warnings.length) {
                els.modelSelectHint.textContent = warnings.join(' ');
                els.modelSelectHint.className = 'text-xs text-amber-700 min-h-[1rem]';
                return;
            }
            if (task === 'dual') {
                const a = modelApi.modelLabelFromPath(opts.transcribeModelPath);
                if (opts.smartTranslate || els.smartTranslateCheck?.checked) {
                    els.modelSelectHint.textContent = getAdvancedEntitled()
                        ? uiTf('双语 + 智能翻译：转写「{a}」→ Pro 大模型翻译', { a })
                        : '双语 + 智能翻译需解锁 Pro';
                } else {
                    const b = modelApi.modelLabelFromPath(opts.translateModelPath);
                    els.modelSelectHint.textContent = uiTf('双语将使用：转写「{a}」→ 翻译「{b}」', { a, b });
                }
                els.modelSelectHint.className = 'text-xs text-gray-500 min-h-[1rem]';
                return;
            }
            if (task === 'translate' && (opts.smartTranslate || els.smartTranslateCheck?.checked)) {
                const a = modelApi.modelLabelFromPath(opts.transcribeModelPath || opts.translateModelPath);
                els.modelSelectHint.textContent = getAdvancedEntitled()
                    ? uiTf('智能翻译：先转写「{a}」→ Pro 大模型翻译', { a })
                    : '智能翻译需解锁 Pro';
                els.modelSelectHint.className = 'text-xs text-gray-500 min-h-[1rem]';
                return;
            }
            els.modelSelectHint.textContent = '';
            els.modelSelectHint.className = 'text-xs text-gray-500 min-h-[1rem]';
        }

        return {
            kindBadge,
            readModelPathFromForm,
            syncModelSelectToPath,
            setModelPathOnForm,
            fillModelSelect,
            refreshModelSelects,
            applyAutoDetectedModelsFromCache,
            browseModelPath,
            updateModelSelectHint,
        };
    }

    return { createTwaiModelSelectUi };
}));
