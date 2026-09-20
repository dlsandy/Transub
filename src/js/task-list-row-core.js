/**
 * Main-window task table row HTML builders (pure — no DOM).
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubTaskListRow = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function taskListRowFactory() {
    function statusMeta(status) {
        const map = {
            pending: { label: '排队', cls: 'row-status-pending' },
            probing: { label: '探测中', cls: 'row-status-probing' },
            ready: { label: '就绪', cls: 'row-status-ready' },
            running: { label: '进行中', cls: 'row-status-running' },
            done: { label: '完成', cls: 'row-status-done' },
            skipped: { label: '已跳过', cls: 'row-status-skipped' },
            cancelled: { label: '已取消', cls: 'row-status-skipped' },
            failed: { label: '失败', cls: 'row-status-failed' },
            error: { label: '错误', cls: 'row-status-error' },
        };
        return map[status] || { label: status || '—', cls: 'row-status-pending' };
    }

    /**
     * @param {object} item
     * @param {(s: string) => string} esc
     */
    function qcFixedTagHtml(item, esc) {
        const mode = String(item?.qcFixedMode || '');
        if (mode !== 'fix' && mode !== 'smart') return '';
        const label = mode === 'smart' ? 'Pro修' : '已修';
        const tip = esc(
            item.qcFixedSummary
            || (mode === 'smart' ? '已智能修复 QC' : '已一键修复 QC')
            || '',
        );
        return `<span class="qc-fixed-tag is-${mode}" title="${tip}">${label}</span>`;
    }

    function acousticLabelFromHint(hint) {
        if (hint === 'music') return '配乐';
        if (hint === 'soft') return '软声';
        if (hint === 'noisy') return '底噪';
        return '';
    }

    /**
     * Sense badge / resense icon HTML for a file row.
     * @param {object} opts
     */
    function buildSenseCellHtml() {
        return { profileBadgeHtml: '', resenseIconHtml: '' };
    }

    /**
     * QC status + fixed tag cell.
     */
    function buildQcCellHtml(item, { esc, idx }) {
        const status = String(item?.status || '');
        // After completion, keep the queue row clean — no QC count / fix affordances here.
        if (status === 'done' || status === 'skipped') {
            return '<span class="text-gray-300">—</span>';
        }
        let qcStatusHtml = '<span class="text-gray-300">—</span>';
        if (item.qcError) {
            qcStatusHtml = `<span class="text-amber-600 text-xs" title="${esc(item.qcError)}">?</span>`;
        } else if (Number.isFinite(Number(item.qcIssueCount))) {
            const n = Number(item.qcIssueCount);
            const fixedHint = item.qcFixedMode
                ? (item.qcFixedMode === 'smart' ? ' · 已智能修复' : ' · 已一键修复')
                : '';
            const tip = esc((item.qcSummary || (n ? `${n} 项问题` : '通过')) + fixedHint);
            qcStatusHtml = n > 0
                ? `<button type="button" data-qc-open="${idx}" class="inline-flex min-w-[1.25rem] justify-center rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5 hover:bg-amber-200" title="${tip}（点击编辑）">${n}</button>`
                : `<span class="text-emerald-600 text-xs" title="${tip}">✓</span>`;
        }
        const qcFixedHtml = qcFixedTagHtml(item, esc);
        return qcFixedHtml
            ? `<span class="qc-cell">${qcStatusHtml}${qcFixedHtml}</span>`
            : qcStatusHtml;
    }

    /**
     * Progress cell HTML.
     */
    const STAGE_SHORT = {
        starting: '启动',
        denoise: '降噪',
        separate: '分离',
        vad: 'VAD',
        model: '加载',
        transcribe: '原文',
        source_cleanup: '清洗',
        semantic_repair: '语义',
        pre_mt_qc: '门闸',
        translate: '翻译',
        cleanup: '润色',
        qc_fix: 'QC',
        qc_loop: '闭环',
        save: '保存',
    };

    function buildProgressCellHtml(item, {
        esc,
        elapsed = '—',
        processed = '—',
    }) {
        const pct = Math.max(0, Math.min(100, Number(item.progress) || 0));
        if (item.status === 'running') {
            const stageShort = STAGE_SHORT[item.stage] || '';
            const hint = stageShort
                ? `${stageShort} · ${pct}%`
                : `${pct}%`;
            const titleDetail = String(item.detail || '').trim();
            return `
                <div class="space-y-0.5 row-progress-live" title="${esc(titleDetail || `已用 ${elapsed} · ${processed}`)}">
                    <div class="row-mini-progress"><span class="row-mini-progress-bar" style="width:${pct}%"></span></div>
                    <div class="flex items-center gap-1.5 min-w-0">
                        <div class="text-[10px] text-gray-500 tabular-nums truncate row-progress-hint">${esc(hint)}</div>
                    </div>
                </div>`;
        }
        if (item.status === 'done' || item.status === 'skipped') {
            return `<span class="text-xs text-gray-500 tabular-nums" title="已用 ${esc(elapsed)}">${esc(processed)}</span>`;
        }
        if (item.status === 'failed') {
            return `<span class="text-xs text-gray-400 tabular-nums" title="已用 ${esc(elapsed)}">${pct ? `${pct}%` : '—'}</span>`;
        }
        return `<span class="text-gray-400 text-xs">—</span>`;
    }

    function buildStyleBadgeHtml(item, ctx = {}) {
        const {
            esc = (s) => String(s ?? ''),
            globalPreset = 'natural_spoken',
            globalNote = '',
            styleApi = null,
            idx = null,
            styleEnabled = true,
        } = ctx;
        if (!styleEnabled) return '';
        const api = styleApi || ((typeof globalThis !== 'undefined' && globalThis.TransubTranslateStyle)
            || (typeof window !== 'undefined' && window.TransubTranslateStyle)
            || null);
        if (!api?.resolveEffectiveTranslateStyle) return '';
        const resolved = api.resolveEffectiveTranslateStyle({
            globalPreset,
            globalNote,
            itemPreset: item.translateStylePreset,
            itemNote: item.translateStyleCustomNote,
            enabled: true,
        });
        const label = String(resolved.label || '').trim();
        if (!label) return '';
        const follow = !!resolved.followGlobal;
        const displayName = follow
            ? '默认'
            : (resolved.preset === 'custom' && resolved.customNote
                ? String(resolved.customNote).trim().slice(0, 12) || label
                : label);
        const tipParts = [
            follow ? '跟随全局' : '本条覆盖',
            item.translateStyleSenseSuggested ? '感知建议' : '',
            label,
            resolved.preset === 'custom' && resolved.customNote
                ? resolved.customNote
                : '',
            '点击设置',
        ].filter(Boolean);
        const tip = esc(tipParts.join(' · '));
        const cls = [
            'row-style-badge',
            follow ? 'is-global' : 'is-override',
            item.translateStyleSenseSuggested ? 'is-sense-suggested' : '',
        ].filter(Boolean).join(' ');
        const rowIdx = Number(idx);
        const idxAttr = Number.isFinite(rowIdx)
            ? ` data-translate-style-idx="${rowIdx}"`
            : '';
        return `<button type="button" class="${cls}"${idxAttr} title="译文风格：${tip}" aria-label="设置译文风格：${esc(follow ? '默认' : label)}"><i class="fa fa-font" aria-hidden="true"></i><span class="row-style-badge-label">${esc(displayName)}</span></button>`;
    }

    /**
     * Compact badge for actual ASR model used (incl. failover).
     */
    function buildAsrRunBadgeHtml(item, esc) {
        if (!item || item.status !== 'done') return '';
        const asr = String(item.asrModel || '').trim();
        if (!asr) return '';
        const escape = typeof esc === 'function' ? esc : ((s) => String(s ?? ''));
        const failedOver = !!item.asrFailedOver;
        const primary = String(item.primaryAsr || '').trim();
        const short = asr.length > 18 ? `${asr.slice(0, 16)}…` : asr;
        const label = failedOver ? `${short}↓` : short;
        const title = failedOver
            ? `实际 ASR ${asr}${primary ? `（回退自 ${primary}）` : ''}`
            : `实际 ASR ${asr}`;
        return `<span class="row-asr-badge${failedOver ? ' is-failover' : ''}" title="${escape(title)}">${escape(label)}</span>`;
    }

    /**
     * Full `<tr>` HTML for one task list item.
     * @param {object} item
     * @param {number} idx
     * @param {object} ctx injected shell helpers / flags
     */
    function buildListRowHtml(item, idx, ctx = {}) {
        const {
            esc = (s) => String(s ?? ''),
            basename = (p) => String(p || '').split(/[/\\]/).pop() || '—',
            normPath = (p) => String(p || '').replace(/\//g, '\\').toLowerCase(),
            formatDuration = () => '—',
            revealPath = '',
            subPath = '',
            autoOn = true,
            running = false,
            qcFixing = false,
            advancedEntitled = false,
            hasSmartQcFix = false,
            errorExpanded = false,
            elapsed = '—',
            processed = '—',
            profileBadge = '',
            methodShort = '',
            senseMtLabel = '',
            acousticHint = '',
            canPostBatch = false,
            canRemove = true,
            canStop = false,
            globalPreset = 'natural_spoken',
            globalNote = '',
            styleApi = null,
            styleEnabled = true,
        } = ctx;

        const styleBadgeHtml = buildStyleBadgeHtml(item, {
            esc, globalPreset, globalNote, styleApi, idx, styleEnabled,
        });
        const folderTitle = subPath
            ? `在文件夹中显示字幕：${basename(subPath)}`
            : `在文件夹中显示：${basename(item.path)}`;
        const detail = item.detail || item.error || '';
        const meta = statusMeta(item.status);
        const subBadge = item.existingSubtitle && item.status === 'ready'
            ? '<span class="ml-1 text-amber-600" title="已有字幕">●</span>' : '';

        const senseCell = buildSenseCellHtml({
            sense: item.sense,
            autoOn,
            running,
            idx,
            esc,
            profileBadge,
            methodShort,
            senseMtLabel,
            acousticHint,
        });

        const qcCell = buildQcCellHtml(item, { esc, idx });
        const editBtn = subPath
            ? `<button type="button" data-edit-sub="${esc(subPath)}" data-edit-video="${esc(item.path)}" class="row-action-btn text-violet-500 hover:text-violet-700 hover:bg-violet-50" title="编辑字幕"><i class="fa fa-pencil text-xs"></i></button>` : '';
        const canQcFix = !running && !qcFixing
            && item.status !== 'done' && item.status !== 'skipped'
            && Number(item.qcIssueCount) > 0
            && canPostBatch;
        const qcFixBtn = canQcFix
            ? `<button type="button" data-qc-fix="${idx}" class="row-action-btn text-amber-600 hover:text-amber-800 hover:bg-amber-50" title="一键修复QC" aria-label="一键修复QC"><i class="fa fa-wrench text-xs"></i></button>`
            : '';
        const qcSmartFixBtn = canQcFix && advancedEntitled && hasSmartQcFix
            ? `<button type="button" data-qc-smart-fix="${idx}" class="row-action-btn text-violet-600 hover:text-violet-800 hover:bg-violet-50" title="智能修复QC (Pro)" aria-label="智能修复QC"><i class="fa fa-magic text-xs"></i></button>`
            : '';
        const retryBtn = (item.status === 'failed' || item.status === 'error') && !running
            ? `<button type="button" data-retry-idx="${idx}" class="row-action-btn text-amber-600 hover:text-amber-800 hover:bg-amber-50" title="重试本条" aria-label="重试本条"><i class="fa fa-repeat text-xs"></i></button>`
            : '';
        const resumeBtn = (item.status === 'failed' || item.status === 'cancelled' || item.status === 'error')
            && !running
            && item.resumable
            && item.resumeFromJobId
            ? `<button type="button" data-resume-idx="${idx}" class="row-action-btn text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50" title="从断点继续（跳过已完成的转写）" aria-label="从断点继续"><i class="fa fa-forward text-xs"></i></button>`
            : '';
        const diagBtn = (item.status === 'failed' || item.status === 'error') && !running
            ? `<button type="button" data-diag-idx="${idx}" class="row-action-btn text-gray-400 hover:text-gray-700 hover:bg-gray-100" title="导出 ASR 诊断包" aria-label="导出诊断包"><i class="fa fa-stethoscope text-xs"></i></button>`
            : '';
        const canStopBtn = canStop || (item.status === 'running' && !!running);
        const stopBtn = canStopBtn
            ? `<button type="button" data-stop-idx="${idx}" class="row-action-btn text-rose-600 hover:text-rose-800 hover:bg-rose-50" title="停止本条任务" aria-label="停止本条任务"><i class="fa fa-stop text-xs"></i></button>`
            : '';
        const removeBtn = canRemove
            ? `<button type="button" data-remove-idx="${idx}" class="row-action-btn text-gray-400 hover:text-rose-600 hover:bg-rose-50" title="从列表移除" aria-label="从列表移除"><i class="fa fa-trash-o text-xs"></i></button>`
            : '';
        const executeBtn = item.path
            ? `<button type="button" data-execute-idx="${idx}" class="row-action-btn text-gray-400 hover:text-primary hover:bg-gray-100" title="执行" aria-label="执行"><i class="fa fa-play text-xs"></i></button>`
            : '';
        const canBurn = !!item.path && (item.status === 'done' || item.status === 'skipped');
        const burnBtn = canBurn
            ? `<button type="button" data-burn-idx="${idx}" class="row-action-btn text-orange-500 hover:text-orange-700 hover:bg-orange-50" title="字幕烧录" aria-label="字幕烧录"><i class="fa fa-fire text-xs"></i></button>`
            : '';
        const moreBtn = `<button type="button" data-more-idx="${idx}" class="row-action-btn text-gray-400 hover:text-primary hover:bg-gray-100" title="更多" aria-label="更多"><i class="fa fa-ellipsis-h text-xs"></i></button>`;
        const isFailed = item.status === 'failed' || item.status === 'error';
        const isCancelledResumable = item.status === 'cancelled' && item.resumable && item.resumeFromJobId;
        const errText = item.error || item.recovery?.tip || (isFailed ? detail : '');
        let detailHtml = '';
        const recoveryApi = (typeof globalThis !== 'undefined' && globalThis.TransubBatchRecovery)
            || (typeof window !== 'undefined' && window.TransubBatchRecovery)
            || null;
        const recoverChips = (!running && recoveryApi?.buildBatchRecoveryChipsHtml)
            ? recoveryApi.buildBatchRecoveryChipsHtml(
                item.recovery,
                idx,
                esc,
                { running, max: 4 },
            )
            : '';
        if (isFailed && errText) {
            const short = errText.length > 72 && !errorExpanded ? `${errText.slice(0, 72)}…` : errText;
            const toggle = errText.length > 72
                ? `<button type="button" class="row-error-toggle" data-error-toggle="${idx}">${errorExpanded ? '收起' : '展开'}</button>`
                : '';
            detailHtml = `<div class="row-error-expand">${esc(short)}${toggle}</div>${recoverChips}`;
        } else if (isCancelledResumable && (item.recovery || recoverChips)) {
            const tip = item.recovery?.shortTip || item.detail || '已取消 · 可从断点继续';
            detailHtml = `<div class="row-error-expand text-amber-700">${esc(tip)}</div>${recoverChips}`;
        } else if (detail) {
            detailHtml = `<div class="cell-ellipsis text-[10px] text-gray-400 mt-0.5" title="${esc(detail)}">${esc(detail)}</div>${recoverChips}`;
        } else if (recoverChips) {
            detailHtml = recoverChips;
        }
        const progressCell = buildProgressCellHtml(item, {
            esc, elapsed, processed,
        });
        const canOpenByName = !!subPath
            && (item.status === 'done' || item.status === 'skipped');
        const nameTitle = canOpenByName
            ? `打开字幕编辑器：${basename(item.path)}`
            : item.path;
        const nameHtml = canOpenByName
            ? `<button type="button" class="cell-ellipsis file-name-link" data-open-editor="${idx}" title="${esc(nameTitle)}">${esc(basename(item.path))}</button>`
            : `<span class="cell-ellipsis font-medium text-gray-800">${esc(basename(item.path))}</span>`;

        return `
            <tr class="task-row" data-idx="${idx}" data-status="${esc(item.status)}" data-path="${esc(normPath(item.path))}">
                <td class="px-2 py-1.5"><input type="checkbox" data-row-check ${item.selected ? 'checked' : ''} ${running ? 'disabled' : ''}></td>
                <td class="px-2 py-1.5 text-xs col-file"><div class="file-cell-main" title="${esc(item.path)}">${nameHtml}${subBadge}${styleBadgeHtml}${senseCell.profileBadgeHtml}${senseCell.resenseIconHtml}</div></td>
                <td class="px-2 py-1.5 text-right text-xs tabular-nums text-gray-500 col-duration">${item.duration ? formatDuration(item.duration) : '—'}</td>
                <td class="px-2 py-1.5 text-right text-xs tabular-nums text-gray-500 col-elapsed"${elapsed !== '—' ? ` title="已用 ${esc(elapsed)}"` : ''}>${esc(elapsed)}</td>
                <td class="px-2 py-1.5 col-progress">${progressCell}</td>
                <td class="px-2 py-1.5 text-xs col-status">
                    <span class="row-status-badge ${meta.cls}">${esc(meta.label)}</span>
                    ${buildAsrRunBadgeHtml(item, esc)}
                    ${detailHtml}
                </td>
                <td class="px-1 py-1.5 text-center text-xs col-qc">${qcCell}</td>
                <td class="px-1 py-1.5 text-center col-actions">
                    <div class="row-actions">
                    ${executeBtn}
                    ${burnBtn}
                    ${stopBtn}
                    ${removeBtn}
                    ${resumeBtn}
                    ${retryBtn}
                    ${diagBtn}
                    ${qcFixBtn}
                    ${qcSmartFixBtn}
                    ${editBtn}
                    <button type="button" data-show-folder="${esc(revealPath)}" data-idx="${idx}"
                        class="row-action-btn text-gray-400 hover:text-primary hover:bg-gray-100 disabled:opacity-30"
                        title="${esc(folderTitle)}" ${revealPath ? '' : 'disabled'}>
                        <i class="fa fa-folder-open text-xs"></i>
                    </button>
                    ${moreBtn}
                    </div>
                </td>
            </tr>`;
    }

    /** @param {Array<{ selected?: boolean }>} items */
    function computeSelectAllState(items) {
        const list = Array.isArray(items) ? items : [];
        const selectedCount = list.filter((i) => i && i.selected).length;
        return {
            checked: list.length > 0 && selectedCount === list.length,
            indeterminate: selectedCount > 0 && selectedCount < list.length,
        };
    }

    /**
     * Toolbar select-all control: icon mirrors list state (empty / partial / all).
     * @param {{ checked?: boolean, indeterminate?: boolean }} st
     */
    function describeSelectAllToolbar(st) {
        const checked = !!(st && st.checked);
        const indeterminate = !!(st && st.indeterminate);
        if (checked) {
            return {
                iconClass: 'fa fa-check-square',
                title: '取消全选 (Ctrl+A)',
                ariaLabel: '取消全选',
                ariaChecked: 'true',
            };
        }
        if (indeterminate) {
            return {
                iconClass: 'fa fa-minus-square-o',
                title: '全选 (Ctrl+A)',
                ariaLabel: '全选',
                ariaChecked: 'mixed',
            };
        }
        return {
            iconClass: 'fa fa-square-o',
            title: '全选 (Ctrl+A)',
            ariaLabel: '全选',
            ariaChecked: 'false',
        };
    }

    return {
        statusMeta,
        qcFixedTagHtml,
        acousticLabelFromHint,
        buildSenseCellHtml,
        buildQcCellHtml,
        buildProgressCellHtml,
        buildAsrRunBadgeHtml,
        buildStyleBadgeHtml,
        buildListRowHtml,
        computeSelectAllState,
        describeSelectAllToolbar,
    };
}));
