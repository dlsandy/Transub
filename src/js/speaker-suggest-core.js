/**
 * 轻量说话人辅助：按句间静音启发式交替标注（非 diarization）
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSpeakerSuggest = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function speakerSuggestCoreFactory() {
    function cueEndMs(cue) {
        if (!cue) return 0;
        if (cue.endMs != null && Number.isFinite(Number(cue.endMs))) return Number(cue.endMs);
        return (Number(cue.startMs) || 0) + 2000;
    }

    /**
     * @param {object[]} cues
     * @param {object} [options]
     * @param {number} [options.switchGapMs=1400] - 超过此间隙则切换说话人
     * @param {number} [options.speakerCount=2]
     * @param {function} [options.cueMarkerKey]
     * @param {function} [options.speakerColor]
     * @returns {{ speakers: object[], cueMarkers: object, assignments: number, summary: string }}
     */
    function suggestAlternatingSpeakers(cues, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const switchGap = Math.max(200, Number(options.switchGapMs) || 1400);
        const count = Math.max(2, Math.min(8, Math.floor(Number(options.speakerCount) || 2)));
        const keyFn = typeof options.cueMarkerKey === 'function'
            ? options.cueMarkerKey
            : ((cue, i) => `${i}:${Math.round(Number(cue?.startMs) || 0)}`);
        const colorFn = typeof options.speakerColor === 'function'
            ? options.speakerColor
            : ((i) => {
                const palette = [
                    '#e11d48', '#2563eb', '#ca8a04', '#16a34a',
                    '#9333ea', '#ea580c', '#0891b2', '#db2777',
                ];
                return palette[Math.abs(i) % palette.length];
            });

        const speakers = [];
        for (let i = 0; i < count; i += 1) {
            speakers.push({
                id: `spk_auto_${i + 1}`,
                name: `说话人 ${i + 1}`,
                color: colorFn(i),
            });
        }

        const cueMarkers = {};
        let speakerIdx = 0;
        let assignments = 0;
        let prevEnd = null;
        for (let i = 0; i < list.length; i += 1) {
            const cue = list[i];
            if (!cue) continue;
            const start = Number(cue.startMs) || 0;
            if (prevEnd != null && start - prevEnd >= switchGap) {
                speakerIdx = (speakerIdx + 1) % count;
            }
            const key = keyFn(cue, i);
            cueMarkers[key] = { speakerId: speakers[speakerIdx].id };
            assignments += 1;
            prevEnd = cueEndMs(cue);
        }

        return {
            speakers,
            cueMarkers,
            assignments,
            summary: assignments
                ? `按静音间隙建议 ${count} 个说话人，已标注 ${assignments} 条（可再手动改）`
                : '没有可标注的条目',
        };
    }

    return {
        cueEndMs,
        suggestAlternatingSpeakers,
    };
}));
