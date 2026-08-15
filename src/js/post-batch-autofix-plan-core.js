/**
 * Post-batch autofix flag planner + progress label parts (pure).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubPostBatchAutofixPlan = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function postBatchAutofixPlanFactory() {
    function normalizeViewing(value, fallback, normalizeFn) {
        if (typeof normalizeFn === 'function') return normalizeFn(value, fallback);
        const v = String(value || fallback || 'clear');
        return ['off', 'light', 'clear'].includes(v) ? v : (fallback || 'clear');
    }

    /**
     * @param {{
     *   savedOpts?: object|null,
     *   form?: object,
     *   taskFallback?: string,
     *   normalizeViewingCleanMode?: Function,
     *   isTranslateLikeTask?: (task: string) => boolean,
     * }} input
     */
    function planPostBatchAutofixFlags(input = {}) {
        const saved = input.savedOpts || null;
        const form = input.form || {};
        const normalize = input.normalizeViewingCleanMode;
        const isTranslateLike = input.isTranslateLikeTask
            || ((task) => task === 'translate' || task === 'dual');

        const doCps = saved
            ? saved.postBatchCpsSplit !== false
            : (form.postBatchCpsSplit != null ? !!form.postBatchCpsSplit : true);
        const doNoise = saved
            ? saved.postBatchRemoveNoise !== false
            : (form.postBatchRemoveNoise != null ? !!form.postBatchRemoveNoise : true);
        const doCompressRep = saved
            ? saved.postBatchCompressRepetition !== false
            : (form.postBatchCompressRepetition != null ? !!form.postBatchCompressRepetition : true);

        const viewingPunctMode = normalizeViewing(
            saved?.postBatchViewingPunctMode ?? form.postBatchViewingPunctMode,
            'clear',
            normalize,
        );
        const interjectionMode = normalizeViewing(
            saved?.postBatchInterjectionMode ?? form.postBatchInterjectionMode,
            'clear',
            normalize,
        );
        const onomatopoeiaMode = normalizeViewing(
            saved?.postBatchOnomatopoeiaMode ?? form.postBatchOnomatopoeiaMode,
            'clear',
            normalize,
        );

        const doViewingPunct = viewingPunctMode !== 'off';
        const doSoftenDiscourse = interjectionMode === 'light';
        const doSoftenOnomatopoeia = onomatopoeiaMode === 'light';
        const doCompactInterjections = interjectionMode === 'clear' || onomatopoeiaMode === 'clear';

        const taskFromSaved = saved?.task === 'transcribe' || saved?.task === 'dual'
            ? saved.task
            : (saved?.task ? 'translate' : null);
        const taskNow = taskFromSaved || String(input.taskFallback || form.task || 'transcribe');
        const isTranslate = isTranslateLike(taskNow);
        const doSpacePunct = isTranslate;
        const doPostprocess = doCps || doNoise || doCompressRep || doSpacePunct || doViewingPunct
            || doSoftenDiscourse || doSoftenOnomatopoeia;

        return {
            doCps,
            doNoise,
            doCompressRep,
            viewingPunctMode,
            interjectionMode,
            onomatopoeiaMode,
            doViewingPunct,
            doSoftenDiscourse,
            doSoftenOnomatopoeia,
            doCompactInterjections,
            taskNow,
            isTranslate,
            doSpacePunct,
            doPostprocess,
            shouldRun: doPostprocess || doCompactInterjections,
        };
    }

    function buildPostBatchAutofixLabelParts(flags = {}) {
        const parts = [];
        if (flags.doSpacePunct) parts.push('句读后空格');
        if (flags.doCps) parts.push('CPS 拆句');
        if (flags.doNoise) parts.push('清理杂音');
        if (flags.doCompressRep) parts.push('压缩叠词');
        if (flags.viewingPunctMode === 'light') parts.push('观影精简标点');
        if (flags.viewingPunctMode === 'clear') parts.push('观影清除标点');
        if (flags.doSoftenDiscourse) parts.push('语气词轻度');
        if (flags.doSoftenOnomatopoeia) parts.push('拟声词轻度');
        if (flags.interjectionMode === 'clear') parts.push('清除语气词');
        if (flags.onomatopoeiaMode === 'clear') parts.push('清除拟声词');
        return parts;
    }

    function filterPostBatchAutofixTargets(items, getPaths) {
        const get = typeof getPaths === 'function' ? getPaths : () => [];
        return (Array.isArray(items) ? items : []).filter((item) => {
            if (item.status !== 'done' && item.status !== 'skipped') return false;
            return get(item).length > 0;
        });
    }

    return {
        planPostBatchAutofixFlags,
        buildPostBatchAutofixLabelParts,
        filterPostBatchAutofixTargets,
    };
}));
