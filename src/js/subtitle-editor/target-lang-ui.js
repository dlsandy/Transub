/**
 * 字幕编辑器 — 成片目标语芯片（与主窗口 quickTargetLang 同源设置）
 */
(function (global) {
    function getTargetApi() {
        if (global.TransubSubtitleTargetLang) return global.TransubSubtitleTargetLang;
        try {
            if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
                return require('../subtitle-target-lang-core');
            }
        } catch (_) { /* ignore */ }
        return null;
    }

    function formValueFromOptions(opts) {
        const api = getTargetApi();
        const o = opts && typeof opts === 'object' ? opts : {};
        if (api?.formValueFromTargetLang && api?.resolveSubtitleTargetLang) {
            return api.formValueFromTargetLang(api.resolveSubtitleTargetLang(o)) || 'simplified';
        }
        const raw = String(o.chineseSubtitleVariant || o.subtitleTargetLang || 'simplified').trim();
        return raw || 'simplified';
    }

    function resolveLangFromOptions(opts) {
        const api = getTargetApi();
        if (api?.resolveSubtitleTargetLang) return api.resolveSubtitleTargetLang(opts || {});
        return 'zh-Hans';
    }

    function labelFromOptions(opts) {
        const api = getTargetApi();
        const lang = resolveLangFromOptions(opts);
        return api?.subtitleTargetLangLabel?.(lang) || lang;
    }

    function isZhFromOptions(opts) {
        const api = getTargetApi();
        const lang = resolveLangFromOptions(opts);
        return api?.isZhSubtitleTarget ? api.isZhSubtitleTarget(lang) : /^zh/i.test(lang);
    }

    /**
     * Merge target-lang + translate-style fields into an IPC payload.
     */
    function attachTranslateTargetFields(payload, settingsOpts, extra = {}) {
        const out = payload && typeof payload === 'object' ? payload : {};
        const opts = { ...(settingsOpts || {}), ...(extra || {}) };
        const api = getTargetApi();
        const fields = api?.buildTargetLangPayloadFields
            ? api.buildTargetLangPayloadFields(opts)
            : {
                subtitleTargetLang: String(opts.subtitleTargetLang || opts.targetLang || 'zh-Hans'),
                targetLang: String(opts.targetLang || opts.subtitleTargetLang || 'zh-Hans'),
                targetLanguage: String(opts.targetLanguage || '简体中文'),
                chineseSubtitleVariant: String(opts.chineseSubtitleVariant || 'simplified'),
            };
        Object.assign(out, fields);
        const stylePreset = String(opts.translateStylePreset || '').trim();
        if (stylePreset) out.translateStylePreset = stylePreset;
        const styleNote = String(opts.translateStyleCustomNote || '').trim();
        if (styleNote) out.translateStyleCustomNote = styleNote;
        const lang = String(opts.language || '').trim();
        if (lang) out.language = lang;
        return out;
    }

    function installTargetLangUi(ctx) {
        const {
            state,
            els,
            electron,
            setStatus,
        } = ctx;
        const select = els.targetLangSelect || document.getElementById('editorTargetLangSelect');
        const wrap = els.targetLangWrap || document.getElementById('editorTargetLangWrap');
        let lastForm = 'simplified';
        let saving = false;

        function fillSelectOptions() {
            if (!select || select.options.length) return;
            const api = getTargetApi();
            const opts = api?.listTargetLangFormOptions?.() || [
                { value: 'simplified', label: '简体中文' },
                { value: 'traditional', label: '繁体(台湾)' },
                { value: 'traditional-tw', label: '繁体(字形)' },
                { value: 'traditional-hk', label: '繁体(香港)' },
                { value: 'en', label: 'English' },
                { value: 'ja', label: '日本語' },
                { value: 'ko', label: '한국어' },
            ];
            for (const o of opts) {
                const el = document.createElement('option');
                el.value = o.value;
                el.textContent = o.label;
                select.appendChild(el);
            }
        }

        function applyZhOnlyVisibility(zh) {
            document.querySelectorAll('[data-zh-only]').forEach((el) => {
                el.classList.toggle('hidden', !zh);
                if (!zh && el.matches?.('button, input, select')) {
                    el.setAttribute('aria-disabled', 'true');
                } else {
                    el.removeAttribute('aria-disabled');
                }
            });
            const dualAssBtn = document.getElementById('editorExportDualAssBtn');
            if (dualAssBtn) {
                const label = labelFromOptions(state.targetLangOptions || {});
                dualAssBtn.title = zh
                    ? 'Pro：导出双语 ASS（Source+ZH 叠层）'
                    : `Pro：导出双语 ASS（原文 + ${label}）`;
            }
            const retransTarget = document.querySelector(
                'input[name="editorRetranscribeWriteAs"][value="target"]',
            );
            const retransLabel = retransTarget?.closest('label')?.querySelector('span');
            if (retransLabel) {
                const lab = labelFromOptions(state.targetLangOptions || {});
                retransLabel.textContent = `译文（→ ${lab}）`;
            }
        }

        function applyFromOptions(opts) {
            const o = opts && typeof opts === 'object' ? opts : {};
            state.targetLangOptions = o;
            fillSelectOptions();
            const form = formValueFromOptions(o);
            lastForm = form;
            if (select && select.value !== form) select.value = form;
            const zh = isZhFromOptions(o);
            applyZhOnlyVisibility(zh);
            if (wrap) {
                wrap.title = `成片目标语言：${labelFromOptions(o)}（翻译/双语；与界面语言无关）`;
            }
            return { form, lang: resolveLangFromOptions(o), label: labelFromOptions(o), zh };
        }

        async function loadFromSettings() {
            try {
                const res = await electron?.transWithAiGetOptions?.({});
                const opts = res?.options && typeof res.options === 'object' ? res.options : {};
                return applyFromOptions(opts);
            } catch (_) {
                return applyFromOptions({});
            }
        }

        async function saveFormValue(formValue, { notify = true } = {}) {
            const api = getTargetApi();
            const form = String(formValue || 'simplified').trim() || 'simplified';
            const lang = api?.targetLangFromFormValue?.(form) || form;
            const variant = api?.chineseSubtitleVariantFromTargetLang?.(lang) || (
                form === 'en' || form === 'ja' || form === 'ko' ? 'simplified' : form
            );
            if (saving) return { ok: false, busy: true };
            saving = true;
            try {
                const res = await electron?.transWithAiSaveOptions?.({
                    chineseSubtitleVariant: form === 'en' || form === 'ja' || form === 'ko' ? form : variant,
                    subtitleTargetLang: lang,
                });
                if (!res?.ok) {
                    if (select) select.value = lastForm;
                    setStatus?.(res?.error || '保存目标语言失败', 'err');
                    return { ok: false, error: res?.error };
                }
                lastForm = form;
                const merged = {
                    ...(state.targetLangOptions || {}),
                    chineseSubtitleVariant: form === 'en' || form === 'ja' || form === 'ko' ? form : variant,
                    subtitleTargetLang: lang,
                    targetLang: lang,
                };
                const info = applyFromOptions(merged);
                if (notify) {
                    setStatus?.(`成片目标语言：${info.label}`, 'ok');
                }
                return { ok: true, ...info };
            } catch (err) {
                if (select) select.value = lastForm;
                setStatus?.(err?.message || '保存目标语言失败', 'err');
                return { ok: false, error: err?.message };
            } finally {
                saving = false;
            }
        }

        function bindUi() {
            fillSelectOptions();
            if (select && !select.dataset.targetLangBound) {
                select.dataset.targetLangBound = '1';
                select.addEventListener('change', () => {
                    void saveFormValue(select.value);
                });
            }
            void loadFromSettings();
        }

        function getCurrentLabel() {
            return labelFromOptions(state.targetLangOptions || {});
        }

        function getCurrentLang() {
            return resolveLangFromOptions(state.targetLangOptions || {});
        }

        return {
            bindUi,
            loadFromSettings,
            applyFromOptions,
            saveFormValue,
            getCurrentLabel,
            getCurrentLang,
            isZhTarget: () => isZhFromOptions(state.targetLangOptions || {}),
            attachTranslateTargetFields,
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installTargetLangUi = installTargetLangUi;
    global.TransubEditorParts.targetLangHelpers = {
        formValueFromOptions,
        resolveLangFromOptions,
        labelFromOptions,
        isZhFromOptions,
        attachTranslateTargetFields,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            installTargetLangUi,
            ...global.TransubEditorParts.targetLangHelpers,
        };
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
