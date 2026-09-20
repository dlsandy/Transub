/**
 * Timeline / waveform playhead scrubbing (mousedown + drag + click-to-seek).
 */
(function (global) {
    function cueDragChanged(dragState, cue, cueEndMs) {
        if (!dragState || !cue) return false;
        const end = typeof cueEndMs === 'function' ? cueEndMs(cue) : (cue.endMs ?? cue.startMs);
        return cue.startMs !== dragState.originStart || end !== dragState.originEnd;
    }

    /**
     * @param {{
     *   state: object,
     *   els: object,
     *   pxToMs: (clientX: number, trackEl?: Element|null) => number,
     *   updatePlayheadUi: (ms: number, opts?: object) => void,
     *   syncPlayback: (updateLabel?: boolean) => void,
     *   closeContextMenu?: () => void,
     *   cueEndMs?: (cue: object) => number,
     * }} ctx
     */
    function installPlayheadScrub(ctx) {
        const {
            state,
            els,
            pxToMs,
            updatePlayheadUi,
            syncPlayback,
            closeContextMenu,
            cueEndMs,
        } = ctx;

        let scrubTrack = null;

        function focusTimelinePanel() {
            try {
                els.timelinePanel?.focus({ preventScroll: true });
            } catch {
                els.timelinePanel?.focus();
            }
        }

        function isScrubbing() {
            return !!state.timeline?.scrubbing;
        }

        function seekToMs(ms) {
            const clamped = Math.max(0, Math.round(Number(ms) || 0));
            if (els.video && state.videoPath) {
                try {
                    els.video.currentTime = clamped / 1000;
                } catch { /* ignore */ }
            }
            updatePlayheadUi(clamped, { follow: false });
        }

        function onScrubMove(e) {
            if (!isScrubbing() || !scrubTrack) return;
            seekToMs(pxToMs(e.clientX, scrubTrack));
        }

        function endScrub() {
            if (!isScrubbing()) return;
            state.timeline.scrubbing = false;
            scrubTrack = null;
            state._abPrevMs = null;
            window.removeEventListener('mousemove', onScrubMove);
            window.removeEventListener('mouseup', endScrub);
            syncPlayback(true);
        }

        function beginScrub(e, trackEl) {
            if (!els.video || !state.videoPath || e.button !== 0) return false;
            closeContextMenu?.();
            e.preventDefault();
            focusTimelinePanel();
            state.timeline.scrubbing = true;
            scrubTrack = trackEl || els.timelineTrack || els.waveformTrack;
            state._abPrevMs = null;
            seekToMs(pxToMs(e.clientX, scrubTrack));
            window.addEventListener('mousemove', onScrubMove);
            window.addEventListener('mouseup', endScrub);
            return true;
        }

        function bindPlayhead(el, trackEl) {
            if (!el || el.dataset.scrubBound === '1') return;
            el.dataset.scrubBound = '1';
            el.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                beginScrub(e, trackEl);
            });
        }

        function bindUi() {
            bindPlayhead(els.timelinePlayhead, els.timelineTrack);
            bindPlayhead(els.waveformPlayhead, els.waveformTrack || els.timelineTrack);
        }

        function shouldSeekVideoAfterCueDrag(dragState, cue) {
            return cueDragChanged(dragState, cue, cueEndMs);
        }

        return {
            beginScrub,
            endScrub,
            bindUi,
            isScrubbing,
            shouldSeekVideoAfterCueDrag,
            cueDragChanged,
        };
    }

    const api = { installPlayheadScrub, cueDragChanged };
    const parts = global.TransubEditorParts || {};
    parts.playheadScrub = api;
    global.TransubEditorParts = parts;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global));
