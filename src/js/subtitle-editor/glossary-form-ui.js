/**
 * Subtitle editor — glossary entry form helpers (role sync + conditional postReplace fields).
 */
(function (global) {
    function installGlossaryFormUi(ctx) {
        if (!ctx?.els) {
            throw new Error('installGlossaryFormUi(ctx): ctx.els required');
        }

        const { els, glossaryCore } = ctx;
        const gc = () => glossaryCore || global.TransubSubtitleGlossary;

        function postReplaceEls() {
            return {
                details: els.glossaryPostReplaceDetails,
                enabled: els.glossaryPostReplaceEnabled,
                srcInc: els.glossaryPostSrcInc,
                srcExc: els.glossaryPostSrcExc,
                dstInc: els.glossaryPostDstInc,
                dstExc: els.glossaryPostDstExc,
                audioEvt: els.glossaryPostAudioEvent,
                pairs: els.glossaryPostReplacePairs,
            };
        }

        function clearPostReplaceForm() {
            const p = postReplaceEls();
            if (p.enabled) p.enabled.checked = true;
            if (p.srcInc) p.srcInc.value = '';
            if (p.srcExc) p.srcExc.value = '';
            if (p.dstInc) p.dstInc.value = '';
            if (p.dstExc) p.dstExc.value = '';
            if (p.audioEvt) p.audioEvt.value = '';
            if (p.pairs) p.pairs.value = '';
            if (p.details) p.details.open = false;
        }

        function fillPostReplaceForm(entry) {
            const api = gc();
            const fields = api?.formatPostReplaceFormFields
                ? api.formatPostReplaceFormFields(entry?.postReplace)
                : {
                    enabled: true,
                    srcIncludes: '',
                    srcExcludes: '',
                    dstIncludes: '',
                    dstExcludes: '',
                    audioEventIn: '',
                    replaceText: '',
                };
            const p = postReplaceEls();
            if (p.enabled) p.enabled.checked = fields.enabled !== false;
            if (p.srcInc) p.srcInc.value = fields.srcIncludes || '';
            if (p.srcExc) p.srcExc.value = fields.srcExcludes || '';
            if (p.dstInc) p.dstInc.value = fields.dstIncludes || '';
            if (p.dstExc) p.dstExc.value = fields.dstExcludes || '';
            if (p.audioEvt) p.audioEvt.value = fields.audioEventIn || '';
            if (p.pairs) p.pairs.value = fields.replaceText || '';
            syncPostReplaceVisibility(entry?.role || els.glossaryRole?.value, !!entry?.postReplace);
        }

        function readPostReplaceFromForm(options = {}) {
            const role = String(options.role || els.glossaryRole?.value || '').trim();
            const p = postReplaceEls();
            const api = gc();
            if (!api?.parsePostReplaceFormFields) {
                return undefined;
            }
            const parsed = api.parsePostReplaceFormFields({
                enabled: p.enabled ? p.enabled.checked : true,
                srcIncludes: p.srcInc?.value || '',
                srcExcludes: p.srcExc?.value || '',
                dstIncludes: p.dstInc?.value || '',
                dstExcludes: p.dstExc?.value || '',
                audioEventIn: p.audioEvt?.value || '',
                replaceText: p.pairs?.value || '',
            });
            if (parsed) return parsed;
            // Role is conditional-post: keep empty shell so type sticks; else clear prior rules.
            if (role === 'postReplace') {
                return { enabled: true, when: {}, replace: [] };
            }
            return null;
        }

        function syncPostReplaceVisibility(role, forceOpen = false) {
            const p = postReplaceEls();
            if (!p.details) return;
            const r = String(role || els.glossaryRole?.value || '').trim();
            const open = forceOpen || r === 'postReplace' || p.details.open;
            if (r === 'postReplace' || forceOpen) p.details.open = true;
            else if (!open) p.details.open = false;
        }

        function onRoleChange() {
            const role = els.glossaryRole?.value;
            if (role === 'character' && els.glossaryPromptInject
                && els.glossaryPromptInject.value === 'hit') {
                // Keep hit when user intentionally set it; only bump empty/default on first character pick
                // handled by shell for legacy — here only open postReplace when needed.
            }
            if (role === 'preReplace' && els.glossaryAsrReplace) {
                els.glossaryAsrReplace.checked = true;
            }
            syncPostReplaceVisibility(role, role === 'postReplace');
        }

        els.glossaryRole?.addEventListener('change', onRoleChange);

        return {
            clearPostReplaceForm,
            fillPostReplaceForm,
            readPostReplaceFromForm,
            syncPostReplaceVisibility,
            onRoleChange,
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installGlossaryFormUi = installGlossaryFormUi;
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
