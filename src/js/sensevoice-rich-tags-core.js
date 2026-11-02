/**
 * SenseVoice rich tags: parse / normalize / sidecar flags / settings.
 * Engine emits emotion / audioEvent / senseLang; desktop respects sensevoiceRichTags.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSensevoiceRichTags = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function sensevoiceRichTagsFactory() {
    const EMOTIONS = Object.freeze([
        'HAPPY', 'SAD', 'ANGRY', 'NEUTRAL', 'FEARFUL', 'DISGUSTED', 'SURPRISED',
    ]);
    const EVENTS = Object.freeze([
        'SPEECH', 'BGM', 'APPLAUSE', 'LAUGHTER', 'CRY', 'SNEEZE', 'BREATH', 'COUGH',
    ]);
    const EVENT_ALIASES = Object.freeze({ MUSIC: 'BGM' });
    const LANGS = Object.freeze(['zh', 'en', 'ja', 'ko', 'yue', 'nospeech']);

    function normalizeSensevoiceRichTagsMode(value) {
        const v = String(value == null ? 'sidecar' : value).trim().toLowerCase();
        if (v === 'off' || v === 'false' || v === '0' || v === 'no' || v === 'none') return 'off';
        if (v === 'sdh' || v === 'export' || v === 'annotate') return 'sdh';
        return 'sidecar';
    }

    function richTagsEnabled(mode) {
        return normalizeSensevoiceRichTagsMode(mode) !== 'off';
    }

    function normalizeEmotion(raw) {
        const u = String(raw || '').trim().toUpperCase();
        if (!u || u === 'EMO_UNKNOWN') return null;
        return EMOTIONS.includes(u) ? u : null;
    }

    function normalizeAudioEvent(raw) {
        let u = String(raw || '').trim().toUpperCase();
        if (!u) return null;
        u = EVENT_ALIASES[u] || u;
        return EVENTS.includes(u) ? u : null;
    }

    function normalizeSenseLang(raw) {
        const low = String(raw || '').trim().toLowerCase();
        return LANGS.includes(low) ? low : null;
    }

    function cleanSensevoiceText(text) {
        return String(text || '')
            .replace(/<\|[^|>]+\|>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Parse raw SenseVoice string with tags.
     * @returns {{ text: string, emotion: string|null, audioEvent: string|null, senseLang: string|null }}
     */
    function parseSensevoiceRich(rawText) {
        const raw = String(rawText || '');
        let emotion = null;
        let audioEvent = null;
        let senseLang = null;
        const re = /<\|([^|>]+)\|>/g;
        let m;
        while ((m = re.exec(raw)) !== null) {
            const token = String(m[1] || '').trim();
            if (!token) continue;
            const upper = token.toUpperCase();
            if (upper === 'EMO_UNKNOWN' || upper === 'WITHITN' || upper === 'WOITN') continue;
            const emo = normalizeEmotion(upper);
            if (emo) {
                emotion = emo;
                continue;
            }
            const evt = normalizeAudioEvent(upper);
            if (evt) {
                audioEvent = evt;
                continue;
            }
            const lang = normalizeSenseLang(token);
            if (lang) senseLang = lang;
        }
        return {
            text: cleanSensevoiceText(raw),
            emotion,
            audioEvent,
            senseLang,
        };
    }

    function pickRichFromCue(cue) {
        if (!cue || typeof cue !== 'object') {
            return { emotion: null, audioEvent: null, senseLang: null };
        }
        const meta = cue.meta && typeof cue.meta === 'object' ? cue.meta : {};
        return {
            emotion: normalizeEmotion(cue.emotion ?? meta.emotion),
            audioEvent: normalizeAudioEvent(cue.audioEvent ?? cue.audio_event ?? meta.audioEvent),
            senseLang: normalizeSenseLang(cue.senseLang ?? cue.sense_lang ?? meta.senseLang),
        };
    }

    /** Sidecar / QC flags derived from event (and optional emotion). */
    function buildRichFlags(rich = {}) {
        const flags = [];
        const evt = normalizeAudioEvent(rich.audioEvent);
        if (evt && evt !== 'SPEECH') {
            flags.push('sv_nonspeech');
            flags.push(`sv_${evt.toLowerCase()}`);
        }
        const emo = normalizeEmotion(rich.emotion);
        if (emo && emo !== 'NEUTRAL') {
            flags.push(`sv_emo_${emo.toLowerCase()}`);
        }
        return flags;
    }

    function isNonspeechEvent(audioEvent) {
        const evt = normalizeAudioEvent(audioEvent);
        return !!(evt && evt !== 'SPEECH');
    }

    /** User-facing side notes for 音效旁注 export (no English jargon). */
    const AUDIO_EVENT_SIDE_NOTE = Object.freeze({
        LAUGHTER: '[笑声]',
        CRY: '[哭声]',
        APPLAUSE: '[掌声]',
        BGM: '[音乐]',
        COUGH: '[咳嗽]',
        SNEEZE: '[喷嚏]',
        BREATH: '[喘息]',
    });

    function sideNoteForAudioEvent(audioEvent) {
        const evt = normalizeAudioEvent(audioEvent);
        if (!evt || evt === 'SPEECH') return '';
        return AUDIO_EVENT_SIDE_NOTE[evt] || '';
    }

    /**
     * Prepend [笑声]-style notes when mode is sdh. Idempotent if note already present.
     * @returns {{ cues: object[], changed: number }}
     */
    function applyAudioEventSideNotes(cues, options = {}) {
        const mode = normalizeSensevoiceRichTagsMode(options.sensevoiceRichTags);
        const list = Array.isArray(cues) ? cues : [];
        if (mode !== 'sdh' || !list.length) {
            return { cues: list, changed: 0 };
        }
        let changed = 0;
        const next = list.map((c) => {
            const rich = pickRichFromCue(c);
            const note = sideNoteForAudioEvent(rich.audioEvent);
            if (!note) return c;
            const text = String(c?.text || '').trim();
            if (!text) return c;
            if (text.startsWith(note) || text.includes(note)) return c;
            changed += 1;
            return { ...c, text: `${note}${text}` };
        });
        return { cues: next, changed };
    }

    /**
     * Strip or keep rich fields on a cue according to mode.
     */
    function applyRichTagsModeToCue(cue, mode) {
        if (!cue || typeof cue !== 'object') return cue;
        if (!richTagsEnabled(mode)) {
            const next = { ...cue };
            delete next.emotion;
            delete next.audioEvent;
            delete next.senseLang;
            delete next.audio_event;
            delete next.sense_lang;
            return next;
        }
        const rich = pickRichFromCue(cue);
        const next = { ...cue };
        if (rich.emotion) next.emotion = rich.emotion;
        else delete next.emotion;
        if (rich.audioEvent) next.audioEvent = rich.audioEvent;
        else delete next.audioEvent;
        if (rich.senseLang) next.senseLang = rich.senseLang;
        else delete next.senseLang;
        return next;
    }

    /**
     * Merge sidecar rich fields onto in-memory cues by overlapping time / index.
     */
    function attachRichFromSidecarEntries(cues, entries, options = {}) {
        const list = Array.isArray(cues) ? cues : [];
        const rows = Array.isArray(entries) ? entries : [];
        if (!list.length || !rows.length) return list;
        if (!richTagsEnabled(options.sensevoiceRichTags)) return list;
        return list.map((c, i) => {
            let startMs = Number(c?.startMs);
            let endMs = Number(c?.endMs);
            if (!Number.isFinite(startMs)) {
                const s = Number(c?.start);
                startMs = Number.isFinite(s) ? Math.round(s * 1000) : NaN;
            }
            if (!Number.isFinite(endMs)) {
                const e = Number(c?.end);
                endMs = Number.isFinite(e) ? Math.round(e * 1000) : NaN;
            }
            let hit = rows.find((e) => Number(e?.index) === i)
                || rows.find((e) => Number(e?.index) === Number(c?.index));
            if (!hit && Number.isFinite(startMs) && Number.isFinite(endMs)) {
                hit = rows.find((e) => {
                    const a = Number(e?.startMs) || 0;
                    const b = Number.isFinite(Number(e?.endMs)) ? Number(e.endMs) : a;
                    return a < endMs && b > startMs;
                });
            }
            if (!hit) return c;
            const rich = pickRichFromCue(hit);
            if (!rich.emotion && !rich.audioEvent && !rich.senseLang) return c;
            const next = { ...c };
            if (rich.emotion) next.emotion = rich.emotion;
            if (rich.audioEvent) next.audioEvent = rich.audioEvent;
            if (rich.senseLang) next.senseLang = rich.senseLang;
            return next;
        });
    }

    const EMOTION_LABEL_ZH = Object.freeze({
        HAPPY: '开心',
        SAD: '低沉',
        ANGRY: '急促',
        NEUTRAL: '平静',
        FEARFUL: '紧张',
        DISGUSTED: '嫌弃',
        SURPRISED: '惊讶',
    });

    const AUDIO_EVENT_LABEL_ZH = Object.freeze({
        SPEECH: '人声',
        BGM: '音乐',
        APPLAUSE: '掌声',
        LAUGHTER: '笑声',
        CRY: '哭声',
        SNEEZE: '喷嚏',
        BREATH: '喘息',
        COUGH: '咳嗽',
    });

    function emotionLabelZh(emotion) {
        const e = normalizeEmotion(emotion);
        return e ? (EMOTION_LABEL_ZH[e] || e) : '';
    }

    function audioEventLabelZh(audioEvent) {
        const e = normalizeAudioEvent(audioEvent);
        if (!e || e === 'SPEECH') return '';
        return AUDIO_EVENT_LABEL_ZH[e] || e;
    }

    function resolveCueRichTags(cue, meta) {
        const fromCue = pickRichFromCue(cue || {});
        const fromMeta = pickRichFromCue(meta || {});
        return {
            emotion: fromCue.emotion || fromMeta.emotion || null,
            audioEvent: fromCue.audioEvent || fromMeta.audioEvent || null,
            senseLang: fromCue.senseLang || fromMeta.senseLang || null,
        };
    }

    /**
     * Compact Chinese chips for editor cue list (empty if nothing useful).
     * @returns {{ html: string, title: string, emotion: string|null, audioEvent: string|null }}
     */
    function formatRichTagsBadge(cue, meta) {
        const rich = resolveCueRichTags(cue, meta);
        const parts = [];
        const titles = [];
        const emoLabel = emotionLabelZh(rich.emotion);
        if (emoLabel && rich.emotion !== 'NEUTRAL') {
            parts.push(`<span class="cue-rich-badge cue-rich-emo" data-emotion="${rich.emotion}">${emoLabel}</span>`);
            titles.push(`情感 ${emoLabel}`);
        }
        const evtLabel = audioEventLabelZh(rich.audioEvent);
        if (evtLabel) {
            parts.push(`<span class="cue-rich-badge cue-rich-evt" data-event="${rich.audioEvent}">${evtLabel}</span>`);
            titles.push(`音效 ${evtLabel}`);
        }
        return {
            html: parts.join(''),
            title: titles.join(' · '),
            emotion: rich.emotion,
            audioEvent: rich.audioEvent,
        };
    }

    return {
        EMOTIONS,
        EVENTS,
        EMOTION_LABEL_ZH,
        AUDIO_EVENT_LABEL_ZH,
        normalizeSensevoiceRichTagsMode,
        richTagsEnabled,
        normalizeEmotion,
        normalizeAudioEvent,
        normalizeSenseLang,
        cleanSensevoiceText,
        parseSensevoiceRich,
        pickRichFromCue,
        buildRichFlags,
        isNonspeechEvent,
        AUDIO_EVENT_SIDE_NOTE,
        sideNoteForAudioEvent,
        applyAudioEventSideNotes,
        applyRichTagsModeToCue,
        attachRichFromSidecarEntries,
        emotionLabelZh,
        audioEventLabelZh,
        resolveCueRichTags,
        formatRichTagsBadge,
    };
}));
