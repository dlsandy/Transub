/**
 * Subtitle editor — batch retranscribe low-confidence cues (merged time windows).
 */
(function (global) {
    function installLowConfRetranscribe(ctx) {
        const {
            state,
            els,
            setStatus,
            editorConfirm,
            runRetranscribeRange,
            selectCue,
            loadRetranscribeDurPrefs,
            refreshCueMeta,
            renderCueList,
            metaCore,
        } = ctx || {};
        if (!state || !els) {
            throw new Error('installLowConfRetranscribe: state and els required');
        }

        function collectLowConfIndexes(maxCues = 50) {
            const max = Math.max(1, Math.min(200, Math.floor(Number(maxCues) || 50)));
            const cues = Array.isArray(state.cues) ? state.cues : [];
            const meta = Array.isArray(state.cueMeta) ? state.cueMeta : [];
            const indexes = [];
            for (let i = 0; i < cues.length; i += 1) {
                if (meta[i]?.low) indexes.push(i);
                if (indexes.length >= max) break;
            }
            return indexes;
        }

        function planRanges(indexes) {
            const smartApi = global.TransubSubtitleQcSmart;
            if (typeof smartApi?.planLowConfidenceRetranscribeRanges === 'function') {
                return smartApi.planLowConfidenceRetranscribeRanges(state.cues, indexes, {
                    maxCues: 50,
                    maxRanges: smartApi.DEFAULT_MAX_RETRANSCRIBE_RANGES || 8,
                    maxDurationSec: smartApi.DEFAULT_MAX_RANGE_SEC || 45,
                    mergeAdjacentGapMs: smartApi.DEFAULT_MERGE_GAP_MS || 800,
                });
            }
            return {
                indexes,
                ranges: indexes.map((idx) => {
                    const cue = state.cues[idx];
                    const startMs = Math.round(Number(cue?.startMs) || 0);
                    const endMs = Math.max(
                        startMs + 200,
                        Math.round(Number(cue?.endMs) || startMs + 200),
                    );
                    return {
                        startMs,
                        endMs,
                        indexes: [idx],
                        durationMs: Math.max(200, endMs - startMs),
                    };
                }),
                cueCount: indexes.length,
                rangeCount: indexes.length,
            };
        }

        async function runLowConfRetranscribeBatch({ padMs, snapAfter } = {}) {
            if (!state.videoPath) {
                setStatus?.('请先关联视频后再重转写', 'err');
                return { ok: false, error: 'no-video' };
            }
            if (typeof runRetranscribeRange !== 'function') {
                setStatus?.('当前环境不支持范围重转写', 'err');
                return { ok: false, error: 'unsupported' };
            }
            const indexes = collectLowConfIndexes(50);
            if (!indexes.length) {
                setStatus?.('无低置信条目', 'warn');
                return { ok: false, skipped: true };
            }
            const planned = planRanges(indexes);
            const ranges = Array.isArray(planned.ranges) ? planned.ranges : [];
            if (!ranges.length) {
                setStatus?.('无低置信条目', 'warn');
                return { ok: false, skipped: true };
            }
            const prefs = typeof loadRetranscribeDurPrefs === 'function'
                ? (loadRetranscribeDurPrefs() || {})
                : {};
            const pad = Number.isFinite(Number(padMs))
                ? Math.max(0, Math.min(2000, Math.round(Number(padMs))))
                : Math.max(0, Math.min(2000, Math.round(Number(prefs.padMs) || 350)));
            const snap = snapAfter !== false && prefs.snapAfter !== false;

            let done = 0;
            for (let i = 0; i < ranges.length; i += 1) {
                if (state.jobAbortRequested) {
                    setStatus?.(`已取消（完成 ${done} 窗）`, 'warn');
                    return { ok: false, cancelled: true, done };
                }
                const range = ranges[i];
                const firstIdx = Array.isArray(range.indexes) ? range.indexes[0] : -1;
                if (firstIdx >= 0 && typeof selectCue === 'function') selectCue(firstIdx);
                await runRetranscribeRange({
                    startMs: range.startMs,
                    endMs: range.endMs,
                    padMs: pad,
                    mode: 'range',
                    writeAs: 'source',
                    snapAfter: snap,
                    detail: `低置信重转 ${i + 1}/${ranges.length}（${planned.cueCount} 条）…`,
                });
                done += 1;
            }
            try { refreshCueMeta?.(); } catch { /* ignore */ }
            try { renderCueList?.(); } catch { /* ignore */ }
            const lowLeft = metaCore?.summarizeLowConfidence
                ? metaCore.summarizeLowConfidence(state.cueMeta).low
                : null;
            const leftHint = lowLeft != null ? `，剩余低置信 ${lowLeft}` : '';
            setStatus?.(`已重转 ${done} 窗（约 ${planned.cueCount} 条）${leftHint}`, 'ok');
            return { ok: true, done, cueCount: planned.cueCount, rangeCount: ranges.length };
        }

        async function openLowConfRetranscribe() {
            if (!state.videoPath) {
                setStatus?.('请先关联视频后再重转写', 'err');
                return;
            }
            const indexes = collectLowConfIndexes(50);
            if (!indexes.length) {
                setStatus?.('无低置信条目', 'warn');
                return;
            }
            const planned = planRanges(indexes);
            const msg = `将合并邻近低置信后重转：${planned.cueCount} 条 → ${planned.rangeCount} 个时间窗。\n写回原文轨，可按 Esc 中止。是否继续？`;
            const ok = typeof editorConfirm === 'function'
                ? await editorConfirm(msg, {
                    title: '重转低置信',
                    detail: '使用当前 ASR 设置对合并后的时间窗做范围重转写',
                })
                : window.confirm(msg);
            if (!ok) return;
            await runLowConfRetranscribeBatch();
        }

        function wireUi() {
            if (els.retranscribeLowConfBtn?.dataset?.lowConfWired === '1') return;
            els.retranscribeLowConfBtn?.addEventListener('click', () => {
                void openLowConfRetranscribe();
            });
            if (els.retranscribeLowConfBtn) els.retranscribeLowConfBtn.dataset.lowConfWired = '1';
        }

        return {
            openLowConfRetranscribe,
            runLowConfRetranscribeBatch,
            collectLowConfIndexes,
            planRanges,
            wireUi,
        };
    }

    global.TransubEditorParts = global.TransubEditorParts || {};
    global.TransubEditorParts.installLowConfRetranscribe = installLowConfRetranscribe;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { installLowConfRetranscribe };
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
