/**
 * Lightweight content-profile / auto-sense classifier for subtitle jobs.
 * Uses filename / language / duration heuristics — no ASR or LLM required.
 *
 * Profiles map to per-item option overrides (audio/VAD + language/ASR/MT).
 * Soft-merge only touches SENSE_OWNED_KEYS; task / device stay under user control.
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubContentProfile = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function contentProfileFactory() {
    const PROFILES = Object.freeze({
        av_soft: 'av_soft',
        film: 'film',
        talk: 'talk',
        unknown: 'unknown',
    });

    const PROFILE_LABELS = Object.freeze({
        av_soft: '日语 AV / 软声',
        film: '影视 / 有配乐',
        talk: '对白 / 访谈',
        unknown: '未识别',
    });

    /** Minimum confidence to auto-apply (not merely suggest). */
    const APPLY_CONFIDENCE = 0.62;

    /**
     * Option keys owned by content sense. Soft-merge only touches these
     * so task / device / smartTranslate stay under user control.
     */
    const PROFILE_OWNED_KEYS = Object.freeze([
        'filmAudioEnhance',
        'filmVadPreset',
        'engineVadModel',
        'vadEnabled',
        'vadSensitive',
        'vadAggressive',
        'vadThreshold',
        'vadMinSpeechDurationMs',
        'vadMinSilenceDurationMs',
        'vadSpeechPadMs',
        'vadMaxSingleSegmentMs',
        'audioLightDenoise',
        'hallucinationSilenceThreshold',
        'glossaryMtEnabled',
        'sakuraNsfwPrompt',
    ]);

    const SENSE_OWNED_KEYS = Object.freeze([
        ...PROFILE_OWNED_KEYS,
        'language',
        'engineAsrModel',
        'engineMtModel',
    ]);

    const AV_SOFT_PATCH = Object.freeze({
        language: 'ja',
        engineAsrModel: 'whisper-large-v3-turbo',
        // Prefer Sakura for JA AV tone; refineSenseModels may fall back to Opus if Sakura missing but Opus installed.
        engineMtModel: 'sakura-1.5b',
        filmAudioEnhance: false,
        filmVadPreset: false,
        engineVadModel: 'whisperseg-asmr',
        vadEnabled: true,
        vadSensitive: true,
        vadAggressive: false,
        vadThreshold: 0.18,
        vadMinSpeechDurationMs: 60,
        vadMinSilenceDurationMs: 140,
        vadSpeechPadMs: 350,
        vadMaxSingleSegmentMs: 30000,
        audioLightDenoise: false,
        // Soft gaps often hold quiet dialogue; 2s skip was dropping too much.
        hallucinationSilenceThreshold: 4,
        glossaryMtEnabled: true,
        sakuraNsfwPrompt: true,
    });

    // Film: prefer fewer music-island cues over soft-AV recall.
    // Higher threshold + longer min speech/silence reduces "." hallucinations
    // and micro-cuts on English dialogue (validated on Spider-Verse WEB-DL).
    // Sense never auto-enables Demucs (hard to install → poor UX); users can still
    // turn on「影视音频增强」manually in the form.
    const FILM_PATCH = Object.freeze({
        engineAsrModel: 'whisper-large-v3-turbo',
        filmAudioEnhance: false,
        filmVadPreset: false,
        engineVadModel: 'silero-vad',
        vadEnabled: true,
        vadSensitive: false,
        vadAggressive: false,
        vadThreshold: 0.55,
        vadMinSpeechDurationMs: 350,
        vadMinSilenceDurationMs: 280,
        vadSpeechPadMs: 200,
        vadMaxSingleSegmentMs: 18000,
        audioLightDenoise: true,
        hallucinationSilenceThreshold: 2,
    });

    /** Free fallback when film enhance is locked (no Advanced). */
    const FILM_FREE_PATCH = Object.freeze({
        engineAsrModel: 'whisper-large-v3-turbo',
        filmAudioEnhance: false,
        filmVadPreset: false,
        engineVadModel: 'silero-vad',
        vadEnabled: true,
        vadSensitive: false,
        vadAggressive: false,
        vadThreshold: 0.58,
        vadMinSpeechDurationMs: 350,
        vadMinSilenceDurationMs: 280,
        vadSpeechPadMs: 200,
        vadMaxSingleSegmentMs: 18000,
        audioLightDenoise: true,
        hallucinationSilenceThreshold: 2,
    });

    const TALK_PATCH = Object.freeze({
        filmAudioEnhance: false,
        filmVadPreset: false,
        vadEnabled: true,
        vadSensitive: false,
        vadAggressive: false,
        audioLightDenoise: true,
    });

    const PROFILE_PRESET_IDS = Object.freeze({
        av_soft: 'ja-av-soft-translate',
        // Film sense uses light denoise + film VAD — not the Demucs「影视音频增强」preset.
        film: null,
        talk: null,
        unknown: null,
    });

    /** Token boundary: treat `_` / `-` / `.` as separators (filename-friendly). */
    const TB = '(?:^|[^a-z0-9\\u4e00-\\u9fff])';
    const TE = '(?:[^a-z0-9\\u4e00-\\u9fff]|$)';

    /**
     * Well-known JAV maker prefixes. Matches are strong AV evidence.
     * Full list lives in opaque `av-makers.am1` / `av-makers-embed.js`
     * (see tools/fetch-av-makers.js). This Set is the runtime view.
     */
    const KNOWN_AV_MAKERS = new Set([
        // Minimal fallback if opaque payload is missing
        'ssis', 'ssni', 'sone', 'stars', 'start', 'fsdss', 'dass', 'dldss',
        'mide', 'midv', 'mifd', 'miaa', 'mimk', 'mvsd', 'meyd', 'jufe', 'jul',
        'pred', 'prst', 'ipx', 'ipzz', 'ipvr', 'cawd', 'atid', 'adn', 'shkd',
        'rbd', 'same', 'hmn', 'hnd', 'hnds', 'wanz', 'pppe', 'ntr', 'nkkd',
        'ngod', 'vec', 'venx', 'abp', 'abs', 'abw', 'aka', 'akaes',
        'sdde', 'sdmm', 'sdmu', 'nhdt', 'nhdtb', 'gvh', 'gvg',
        'dvaj', 'dva', 'ebod', 'eyan', 'fj', 'fcdss', 'kmhrs', 'luxu',
        'maan', 'siro', 'gana', 'mium', 'mywife', 'oren', 'ara',
        'fc2', 'ppv',
    ]);

    function loadOpaqueAvMakers() {
        const merge = (list) => {
            if (!Array.isArray(list)) return 0;
            let n = 0;
            for (const raw of list) {
                const p = String(raw || '').trim().toLowerCase();
                if (!/^[a-z][a-z0-9]{1,5}$/.test(p)) continue;
                if (!KNOWN_AV_MAKERS.has(p)) {
                    KNOWN_AV_MAKERS.add(p);
                    n += 1;
                }
            }
            return n;
        };

        // Renderer: sync embed loader (see av-makers-embed.js)
        try {
            const g = typeof globalThis !== 'undefined' ? globalThis
                : (typeof window !== 'undefined' ? window : null);
            if (g && typeof g.__TRANSUB_LOAD_AV_MAKERS__ === 'function') {
                merge(g.__TRANSUB_LOAD_AV_MAKERS__());
                return;
            }
        } catch { /* ignore */ }

        // Node / Electron main: read opaque .am1 next to this module
        try {
            if (typeof require === 'undefined' || typeof Buffer === 'undefined') return;
            const fs = require('fs');
            const path = require('path');
            const zlib = require('zlib');
            const filePath = path.join(__dirname, 'av-makers.am1');
            if (!fs.existsSync(filePath)) return;
            const buf = fs.readFileSync(filePath);
            if (!Buffer.isBuffer(buf) || buf.length < 5) return;
            if (buf.subarray(0, 4).toString('utf8') !== 'AM01') return;
            const key = Buffer.from('TransubAvMakers01');
            const xored = Buffer.alloc(buf.length - 4);
            for (let i = 0; i < xored.length; i++) xored[i] = buf[i + 4] ^ key[i % key.length];
            const payload = JSON.parse(zlib.inflateSync(xored).toString('utf8'));
            merge(payload && payload.makers);
        } catch { /* ignore */ }
    }

    loadOpaqueAvMakers();

    const CODEC_FALSE_POSITIVE = new Set([
        'h264', 'h265', 'x264', 'x265', 'avc', 'hevc', 'aac', 'mp3', 'mp4', 'mkv', 'webm', 'av1',
    ]);

    /** Explicit AV / soft-scene path or name tokens (strong). */
    const AV_STRONG_RE = new RegExp(
        `${TB}(`
        + 'fc2[-_]?ppv|caribbean|carib|1pondo|heyzo|heydouga|prestige|sod[-_]?create|tokyo[-_]?hot'
        + '|一本道|东京热|jav|javlibrary|javbus|javdb|uncensored|censored|nsfw|r[-_]?18'
        + '|adult[-_]?video|soft[-_]?core|asmr|里番|エロ|無修正|无修正|有碼|无码|有码'
        + `)${TE}`,
        'i',
    );

    /** Generic CODE-123 pattern (weak alone — shop SKUs collide). */
    const AV_CODE_RE = new RegExp(`${TB}([a-z]{2,5})[-_](\\d{2,5})${TE}`, 'i');

    /** Numbered amateur series: 200GANA-3420, 300MIUM-123 (digits glued to maker code). */
    const AV_NUMBERED_CODE_RE = /\d{2,4}([a-z]{2,5})[-_](\d{2,5})/gi;

    /** Commercial / instructional copy (product videos, tutorials). */
    const COMMERCIAL_TALK_RE = new RegExp(
        `${TB}(`
        + '产品介绍|产品说明|产品演示|商品介绍|使用说明|安装说明|安装教程|开箱|评测|教程|讲解|解说'
        + '|宣传片|广告片|旗舰店|天猫|淘宝|京东|拼多多|抖音|直播回放'
        + '|unboxing|tutorial|howto|how[-_]?to|walkthrough|sku|demo|review|manual|promo'
        + `)${TE}`,
        'i',
    );

    /** Path folders that reinforce AV. */
    const AV_FOLDER_RE = new RegExp(
        `${TB}(jav|javs|adult|nsfw|r18|av|エロ|裏番|里番|無修正|无修正)${TE}`,
        'i',
    );

    /** @type {ReadonlyArray<{ re: RegExp, weight: number, profile: string, reason: string, id?: string }>} */
    const NAME_RULES = Object.freeze([
        { id: 'av_strong', re: AV_STRONG_RE, weight: 0.55, profile: 'av_soft', reason: 'AV 关键词/厂牌' },
        { id: 'film_release', re: new RegExp(`${TB}(bluray|bdrip|remux|web[-_]?dl|webrip|hdtv|uhd|truehd|dts[-_]?hd|atmos|criterion)${TE}`, 'i'), weight: 0.42, profile: 'film', reason: '影视发行标签' },
        { id: 'film_keyword', re: new RegExp(`${TB}(movie|cinema|feature|剧场版|电影|影片|劇場版|documentary|纪录片)${TE}`, 'i'), weight: 0.35, profile: 'film', reason: '影视关键词' },
        { id: 'film_res', re: new RegExp(`${TB}(2160p|1080p|720p|4k|uhd)${TE}`, 'i'), weight: 0.12, profile: 'film', reason: '影视分辨率标记' },
        { id: 'film_episode', re: new RegExp(`${TB}(s\\d{1,2}e\\d{1,3}|season\\s*\\d+|第\\d+季|第\\d+集)${TE}`, 'i'), weight: 0.28, profile: 'film', reason: '剧集标记' },
        { id: 'talk_keyword', re: new RegExp(`${TB}(interview|podcast|lecture|talk[-_]?show|会议|访谈|讲座|対談|对谈|研讨|演讲)${TE}`, 'i'), weight: 0.45, profile: 'talk', reason: '对白/访谈关键词' },
        { id: 'commercial_talk', re: COMMERCIAL_TALK_RE, weight: 0.58, profile: 'talk', reason: '产品/教程解说' },
    ]);

    function basenameOf(filePath) {
        const s = String(filePath || '').replace(/\\/g, '/');
        const i = s.lastIndexOf('/');
        return i >= 0 ? s.slice(i + 1) : s;
    }

    function stemOf(fileName) {
        const name = String(fileName || '');
        const i = name.lastIndexOf('.');
        return i > 0 ? name.slice(0, i) : name;
    }

    /**
     * Basename stem + up to 3 parent folders (path context for shop vs AV libraries).
     */
    function buildScoreText(filePathOrName) {
        const raw = String(filePathOrName || '').replace(/\\/g, '/');
        const parts = raw.split('/').filter(Boolean);
        const file = parts.length ? parts[parts.length - 1] : raw;
        const stem = stemOf(file);
        const folders = parts.slice(0, -1).slice(-3).map((p) => stemOf(p));
        return {
            stem,
            folders,
            text: [stem, ...folders].filter(Boolean).join(' '),
            full: parts.map((p) => stemOf(p)).filter(Boolean).join(' '),
        };
    }

    function clamp01(n) {
        const x = Number(n);
        if (!Number.isFinite(x)) return 0;
        return Math.max(0, Math.min(1, x));
    }

    function isJaLanguage(language) {
        const lang = String(language || '').trim().toLowerCase();
        return lang === 'ja' || lang === 'japanese' || lang === 'jp';
    }

    /**
     * Guess ISO language from filename / path script cues (no ASR).
     * @returns {{ language: string, confidence: number, reason: string } | null}
     */
    function guessLanguageFromName(filePathOrName) {
        const { text, full } = buildScoreText(filePathOrName);
        const sample = `${text} ${full}`;
        if (/[\u3040-\u30ff]/.test(sample)) {
            return { language: 'ja', confidence: 0.72, reason: '文件名含假名' };
        }
        if (/[\uac00-\ud7af]/.test(sample)) {
            return { language: 'ko', confidence: 0.7, reason: '文件名含韩文' };
        }
        if (/\b(japanese|nihongo|日语|日本語|日文)\b/i.test(sample)) {
            return { language: 'ja', confidence: 0.65, reason: '文件名语种标记' };
        }
        if (/\b(korean|한국어|韩语|韓語|韩文)\b/i.test(sample)) {
            return { language: 'ko', confidence: 0.65, reason: '文件名语种标记' };
        }
        if (/\b(english|英语|英語|英文)\b/i.test(sample)) {
            return { language: 'en', confidence: 0.55, reason: '文件名语种标记' };
        }
        if (/\b(chinese|mandarin|中文|汉语|漢語|普通话)\b/i.test(sample)) {
            return { language: 'zh', confidence: 0.55, reason: '文件名语种标记' };
        }
        // Known AV makers strongly imply Japanese dialogue (basename or parent folder)
        const codes = extractAvCodesFromPath(filePathOrName);
        if (codes.some((c) => c.known) || AV_STRONG_RE.test(sample) || AV_FOLDER_RE.test(full)) {
            // Strong enough to skip short-window LID (opening BGM often false-positives as en)
            return { language: 'ja', confidence: 0.7, reason: 'AV 语境先验' };
        }
        return null;
    }

    /**
     * Soft prior from container / audio-track language tags.
     * Bare `en` is frequently wrong on Asian rips — keep it weak so short-window LID can override.
     * @returns {{ language: string, confidence: number, reason: string } | null}
     */
    function priorFromMetaLanguage(rawLang) {
        const lang = String(rawLang || '').trim().toLowerCase().split(/[-_]/)[0];
        if (!lang || lang === 'und' || lang === 'unknown' || lang === 'auto') return null;
        if (lang === 'ja' || lang === 'jp' || lang === 'jpn') {
            return { language: 'ja', confidence: 0.82, reason: '音轨标记 ja' };
        }
        if (lang === 'zh' || lang === 'chi' || lang === 'zho' || lang === 'cmn') {
            return { language: 'zh', confidence: 0.8, reason: '音轨标记 zh' };
        }
        if (lang === 'ko' || lang === 'kor') {
            return { language: 'ko', confidence: 0.8, reason: '音轨标记 ko' };
        }
        if (lang === 'en' || lang === 'eng') {
            return { language: 'en', confidence: 0.4, reason: '音轨标记 en（弱）' };
        }
        return { language: lang, confidence: 0.7, reason: `音轨标记 ${lang}` };
    }

    /**
     * True when filename / path heuristics already decide the content profile.
     * Deep probes (Whisper LID, ffmpeg acoustic) should be skipped in this case.
     */
    function isFilenameSenseConfident(classification = {}) {
        if (!classification || classification.profile === PROFILES.unknown) return false;
        if (classification.strongAv) return true;
        return Number(classification.confidence || 0) >= APPLY_CONFIDENCE;
    }

    /**
     * Strong AV evidence (known 番号 / AV folder / strong AV keywords) can finish
     * sense immediately on drag — no probe duration, LID, or acoustic needed.
     */
    function isInstantAvSenseCandidate(classification = {}) {
        if (!classification || classification.profile !== PROFILES.av_soft) return false;
        return !!classification.strongAv;
    }

    /**
     * Whether short-window speech LID is useful given current priors.
     */
    function shouldSniffSpokenLanguage(input = {}, baseOptions = {}) {
        const formLang = String(baseOptions.language || '').trim().toLowerCase();
        if (formLang && formLang !== 'auto') return false;
        // Explicit deep re-sense: always allow short-window LID (unless form locked)
        if (input.forceDeep) return true;
        // Filename already decisive — skip Whisper short-window LID
        if (input.profileConfident
            || isFilenameSenseConfident({
                profile: input.profile,
                confidence: input.profileConfidence,
                strongAv: input.strongAv,
            })) {
            return false;
        }
        // Weak container tags (esp. bare en) must not suppress LID
        if (input.metaLanguage && Number(input.metaConfidence || 0) >= 0.65) return false;
        if (input.nameLanguage && Number(input.nameConfidence || 0) >= 0.65) return false;
        return true;
    }

    /**
     * Pick a short LID / acoustic window that skips typical opening titles & BGM.
     * First ~30–90s of AV/film is usually non-dialogue; sampling there yields weak EN false positives.
     *
     * @param {{ durationSec?: number, windowSec?: number }} input
     * @returns {{ startSec: number, durationSec: number, reason: string, skippedIntro: boolean }}
     */
    function resolveSenseSniffWindow(input = {}) {
        const mediaDur = Math.max(0, Number(input.durationSec) || 0);
        const win = Math.max(3, Math.min(30, Number(input.windowSec) || 12));

        let startSec = 0;
        let reason = '片头区';

        if (mediaDur <= 0) {
            // Duration unknown: skip a fixed intro pad; engine falls back if past EOF
            startSec = 60;
            reason = '跳过片头约60s';
        } else if (mediaDur < 60) {
            // Short clip — sample mid-body rather than cold open
            const maxStart = Math.max(0, mediaDur - win);
            startSec = Math.min(maxStart, mediaDur * 0.35);
            reason = startSec >= 2 ? `短片中段约${Math.round(startSec)}s` : '片头区';
        } else {
            // Prefer ~1–3 min in (after typical opening), leave room for the window
            const ideal = Math.min(180, Math.max(60, mediaDur * 0.08));
            const maxStart = Math.max(0, mediaDur - win - 0.5);
            startSec = Math.min(ideal, maxStart);
            reason = `跳过片头约${Math.round(startSec)}s`;
        }

        return {
            startSec: Math.round(startSec * 10) / 10,
            durationSec: win,
            reason,
            skippedIntro: startSec >= 30,
        };
    }

    /**
     * Whether short-window LID should override a filename/path language prior.
     * Weak sniff must not beat a stronger contextual prior (e.g. AV → ja).
     * Intro-region samples need higher confidence than post-intro dialogue windows.
     *
     * @param {{ language?: string, confidence?: number }} sniff
     * @param {{ language?: string, confidence?: number } | null} nameGuess
     * @param {{ skippedIntro?: boolean }} [opts]
     */
    function shouldPreferSniffLanguage(sniff = {}, nameGuess = null, opts = {}) {
        const sniffLang = String(sniff.language || '').trim().toLowerCase();
        const sniffConf = Number(sniff.confidence) || 0;
        const skippedIntro = opts.skippedIntro === true;
        // Intro BGM often looks like English at ~50%; require a stronger bar there.
        const minBare = skippedIntro ? 0.5 : 0.62;
        if (!sniffLang || sniffLang === 'auto' || sniffConf < minBare) return false;
        if (!nameGuess?.language) return true;

        const nameConf = Number(nameGuess.confidence) || 0;
        const nameLang = String(nameGuess.language || '').trim().toLowerCase();
        if (sniffLang === nameLang) return sniffConf >= nameConf;

        const minVsName = skippedIntro ? 0.65 : 0.72;
        if (sniffConf >= minVsName) return true;
        return sniffConf > nameConf + (skippedIntro ? 0.08 : 0.12);
    }

    /**
     * Stable memory keys for a media path (folder + known AV maker).
     * @returns {string[]}
     */
    function buildSenseMemoryKeys(filePathOrName) {
        const raw = String(filePathOrName || '').replace(/\\/g, '/');
        const parts = raw.split('/').filter(Boolean);
        const file = parts.length ? parts[parts.length - 1] : raw;
        const keys = [];
        const folders = parts.slice(0, -1).slice(-2);
        if (folders.length) {
            keys.push(`folder:${folders.map((p) => stemOf(p).toLowerCase()).join('/')}`);
        }
        const codes = extractAvCodesFromPath(filePathOrName);
        for (const c of codes.filter((x) => x.known)) {
            keys.push(`maker:${c.prefix}`);
        }
        return [...new Set(keys)];
    }

    /**
     * Apply stored adopt/reject preferences onto a classification.
     * @returns {{ classification: object, memoryNote: string, forceSuggest: boolean, forceAdopt: boolean }}
     */
    function applySenseMemoryToClassification(classification, memoryHits = []) {
        const hits = Array.isArray(memoryHits) ? memoryHits.filter(Boolean) : [];
        if (!classification || !hits.length) {
            return {
                classification,
                memoryNote: '',
                forceSuggest: false,
                forceAdopt: false,
            };
        }
        const next = {
            ...classification,
            scores: { ...(classification.scores || {}) },
            reasons: [...(classification.reasons || [])],
        };
        let forceSuggest = false;
        let forceAdopt = false;
        let memoryNote = '';

        for (const hit of hits) {
            const prefer = hit.prefer !== false;
            const profile = hit.profile;
            if (!profile || profile === PROFILES.unknown) continue;
            if (prefer) {
                next.scores[profile] = Math.min(1, Math.max(Number(next.scores[profile]) || 0, APPLY_CONFIDENCE));
                next.reasons.push(`记忆偏好「${PROFILE_LABELS[profile] || profile}」`);
                if (next.profile === profile || !next.profile || next.profile === PROFILES.unknown
                    || (Number(next.scores[profile]) >= Number(next.scores[next.profile] || 0))) {
                    next.profile = profile;
                    next.confidence = Math.max(Number(next.confidence) || 0, APPLY_CONFIDENCE);
                    next.label = PROFILE_LABELS[profile] || profile;
                    next.presetId = PROFILE_PRESET_IDS[profile] || null;
                    forceAdopt = true;
                }
                memoryNote = `记忆：偏好 ${PROFILE_LABELS[profile] || profile}`;
            } else if (next.profile === profile) {
                forceSuggest = true;
                forceAdopt = false;
                next.reasons.push(`记忆：曾不采纳「${PROFILE_LABELS[profile] || profile}」`);
                memoryNote = `记忆：不自动采纳 ${PROFILE_LABELS[profile] || profile}`;
            }
        }
        return { classification: next, memoryNote, forceSuggest, forceAdopt };
    }

    /**
     * Adjust overrides from short-window acoustic probe.
     */
    function applyAcousticHints(overrides = {}, acoustic = {}, ctx = {}) {
        const out = { ...overrides };
        const notes = [];
        if (!acoustic || typeof acoustic !== 'object') {
            return { overrides: out, notes, hint: 'neutral' };
        }
        const profile = ctx.profile || PROFILES.unknown;
        const hint = acoustic.hint
            || (acoustic.musicLikely ? 'music' : acoustic.softSparse ? 'soft' : acoustic.noisyFloor ? 'noisy' : 'neutral');
        if (hint === 'neutral' && !acoustic.musicLikely && !acoustic.softSparse && !acoustic.noisyFloor) {
            return { overrides: out, notes, hint };
        }
        if (hint === 'music' || acoustic.musicLikely) {
            if (profile === PROFILES.film || profile === PROFILES.unknown) {
                // Sense path: never auto-enable Demucs (install friction); use light denoise + VAD.
                out.filmAudioEnhance = false;
                out.audioLightDenoise = true;
                out.engineVadModel = out.engineVadModel || 'silero-vad';
                notes.push('声学偏配乐 → 轻度降噪（感知不自动启用 Demucs）');
                // Tighten VAD against BGM pulses → punctuation-only ASR cues
                const thr = Number(out.vadThreshold);
                out.vadThreshold = Number.isFinite(thr) ? Math.max(thr, 0.58) : 0.58;
                const minSpeech = Number(out.vadMinSpeechDurationMs);
                out.vadMinSpeechDurationMs = Number.isFinite(minSpeech)
                    ? Math.max(minSpeech, 350)
                    : 350;
                const minSil = Number(out.vadMinSilenceDurationMs);
                out.vadMinSilenceDurationMs = Number.isFinite(minSil)
                    ? Math.max(minSil, 280)
                    : 280;
                if (out.hallucinationSilenceThreshold == null || out.hallucinationSilenceThreshold === '') {
                    out.hallucinationSilenceThreshold = 2;
                }
                notes.push('配乐向 VAD 收紧');
            }
        } else if (hint === 'soft' || acoustic.softSparse) {
            if (profile === PROFILES.av_soft || profile === PROFILES.unknown || profile === PROFILES.talk) {
                out.audioLightDenoise = false;
                out.filmAudioEnhance = false;
                if (!out.vadSensitive) {
                    out.vadSensitive = true;
                    out.engineVadModel = 'whisperseg-asmr';
                    notes.push('声学偏软声稀疏 → 灵敏检出');
                } else {
                    notes.push('声学偏软声稀疏');
                }
            }
        } else if (hint === 'noisy' || acoustic.noisyFloor) {
            if (profile !== PROFILES.av_soft) {
                out.audioLightDenoise = true;
                notes.push('声学偏底噪 → 轻度降噪');
            }
        }

        return { overrides: out, notes, hint };
    }

    /**
     * Whether to run acoustic sniff for this item.
     */
    function shouldProbeAcoustic(input = {}) {
        const profile = input.profile || PROFILES.unknown;
        if (input.force) return true;
        // Strong AV already has a dedicated audio recipe — skip unless forced
        if (profile === PROFILES.av_soft && input.strongAv) return false;
        // Filename already decisive (film / talk / weak AV) — skip ffmpeg window
        if (isFilenameSenseConfident({
            profile,
            confidence: input.confidence,
            strongAv: input.strongAv,
        })) {
            return false;
        }
        return profile === PROFILES.film
            || profile === PROFILES.talk
            || profile === PROFILES.unknown
            || (profile === PROFILES.av_soft && !input.strongAv);
    }

    /**
     * True when the user already set an explicit audio profile in the form/options.
     * Auto-apply should not override these.
     */
    function hasManualAudioProfile(options = {}) {
        if (options.filmAudioEnhance) return true;
        if (options.filmVadPreset) return true;
        if (options.vadSensitive) return true;
        const vad = String(options.engineVadModel || '').toLowerCase();
        if (vad.includes('whisperseg')) return true;
        return false;
    }

    function extractAvCodes(text) {
        const out = [];
        const seen = new Set();
        const pushCode = (prefixRaw, numRaw) => {
            const prefix = String(prefixRaw || '').toLowerCase();
            const num = String(numRaw || '');
            if (!prefix || !num || CODEC_FALSE_POSITIVE.has(prefix)) return;
            const raw = `${prefix}-${num}`;
            if (seen.has(raw)) return;
            seen.add(raw);
            out.push({
                prefix,
                num,
                known: KNOWN_AV_MAKERS.has(prefix),
                raw,
            });
        };

        const re = new RegExp(AV_CODE_RE.source, 'gi');
        let m = re.exec(text);
        while (m) {
            pushCode(m[1], m[2]);
            m = re.exec(text);
        }

        const numRe = new RegExp(AV_NUMBERED_CODE_RE.source, 'gi');
        m = numRe.exec(text);
        while (m) {
            pushCode(m[1], m[2]);
            m = numRe.exec(text);
        }
        return out;
    }

    /**
     * AV codes from basename stem and recent parent folders (renames keep folder 番号).
     */
    function extractAvCodesFromPath(filePathOrName) {
        const { stem, folders, full } = buildScoreText(filePathOrName);
        const parts = [stem, ...folders, full];
        const out = [];
        const seen = new Set();
        for (const part of parts) {
            for (const code of extractAvCodes(part)) {
                if (seen.has(code.raw)) continue;
                seen.add(code.raw);
                out.push(code);
            }
        }
        return out;
    }

    function scoreName(fileName, options = {}) {
        const { stem, text, full } = buildScoreText(fileName);
        const scores = { av_soft: 0, film: 0, talk: 0 };
        const reasons = [];
        let strongAv = false;
        const commercialTalk = COMMERCIAL_TALK_RE.test(text) || COMMERCIAL_TALK_RE.test(full);
        const avFolder = AV_FOLDER_RE.test(full);

        for (const rule of NAME_RULES) {
            if (!rule.re.test(text) && !(rule.id === 'commercial_talk' && COMMERCIAL_TALK_RE.test(full))) {
                continue;
            }
            // film_res alone is too weak — only count when other film signals exist later
            if (rule.id === 'film_res') continue;
            scores[rule.profile] = Math.min(1, scores[rule.profile] + rule.weight);
            reasons.push(rule.reason);
            if (rule.id === 'av_strong') strongAv = true;
        }

        // Resolution tag only reinforces existing film score
        if (scores.film > 0) {
            const resRule = NAME_RULES.find((r) => r.id === 'film_res');
            if (resRule?.re.test(stem)) {
                scores.film = Math.min(1, scores.film + resRule.weight);
                reasons.push(resRule.reason);
            }
        }

        if (avFolder) {
            scores.av_soft = Math.min(1, scores.av_soft + 0.35);
            reasons.push('路径含 AV 目录');
            strongAv = true;
        }

        const codes = extractAvCodesFromPath(fileName);
        const knownCodes = codes.filter((c) => c.known);
        const weakCodes = codes.filter((c) => !c.known);

        // Known maker 番号: strong AV unless filename is clearly a product/tutorial demo
        if (knownCodes.length) {
            if (commercialTalk) {
                scores.av_soft = Math.min(1, scores.av_soft + 0.22);
                reasons.push(`厂牌号遇商品解说(${knownCodes[0].raw.toUpperCase()})`);
            } else {
                scores.av_soft = Math.min(1, scores.av_soft + 0.52);
                reasons.push(`已知厂牌番号(${knownCodes[0].raw.toUpperCase()})`);
                strongAv = true;
            }
        } else if (weakCodes.length) {
            // Generic CODE-123: only count when JA / AV folder / already strong, and not commercial-only
            const allowWeak = strongAv || avFolder || isJaLanguage(options.language);
            if (allowWeak && !commercialTalk) {
                scores.av_soft = Math.min(1, scores.av_soft + 0.32);
                reasons.push(`疑似番号(${weakCodes[0].raw.toUpperCase()})`);
            } else if (commercialTalk && !strongAv) {
                reasons.push('货号疑似SKU，已忽略');
            }
        }

        // Commercial product copy: boost talk; veto AV only when evidence is weak
        if (commercialTalk) {
            if (scores.talk < 0.5) {
                scores.talk = Math.min(1, Math.max(scores.talk, 0.58));
                if (!reasons.includes('产品/教程解说')) reasons.push('产品/教程解说');
            }
            if (!strongAv && scores.av_soft > 0 && scores.av_soft < 0.5) {
                scores.av_soft = 0;
                reasons.push('商品解说否决弱AV猜测');
            }
        }

        return { scores, reasons, strongAv, commercialTalk, codes };
    }

    /**
     * Classify one media item.
     * @param {{ path?: string, fileName?: string, durationSec?: number, language?: string, task?: string }} input
     */
    function classifyContentProfile(input = {}) {
        const fileName = input.fileName || input.path || '';
        const { scores, reasons, strongAv } = scoreName(fileName, { language: input.language });
        const lang = input.language;
        const durationSec = Number(input.durationSec) || 0;

        if (isJaLanguage(lang) && scores.av_soft > 0) {
            scores.av_soft = Math.min(1, scores.av_soft + 0.15);
            reasons.push('日语片源');
        } else if (isJaLanguage(lang) && scores.av_soft === 0 && scores.film === 0 && scores.talk === 0) {
            // Soft prior for JA without other signals — not enough alone to apply
            scores.av_soft = 0.2;
            reasons.push('日语（弱先验）');
        }

        // Feature / feature length leans film when release tags already present
        if (durationSec >= 70 * 60 && scores.film > 0) {
            scores.film = Math.min(1, scores.film + 0.1);
            reasons.push('长片时长');
        }
        // Typical AV length reinforces existing AV score
        if (durationSec >= 40 * 60 && durationSec <= 200 * 60 && scores.av_soft >= 0.35) {
            scores.av_soft = Math.min(1, scores.av_soft + 0.08);
            reasons.push('片长符合AV常见区间');
        }
        // Very short clips with commercial talk → more talk
        if (durationSec > 0 && durationSec <= 20 * 60 && scores.talk >= 0.4) {
            scores.talk = Math.min(1, scores.talk + 0.08);
        }
        // Strong AV evidence floor so known makers always reach auto-apply
        if (strongAv && scores.av_soft < APPLY_CONFIDENCE) {
            scores.av_soft = APPLY_CONFIDENCE;
        }

        let profile = PROFILES.unknown;
        let confidence = 0;
        for (const key of ['av_soft', 'film', 'talk']) {
            if (scores[key] > confidence) {
                confidence = scores[key];
                profile = key;
            }
        }
        // Prefer AV when tied/near-tied with talk and strong AV evidence exists
        if (strongAv && scores.av_soft >= 0.5 && scores.av_soft + 0.05 >= scores.talk) {
            profile = PROFILES.av_soft;
            confidence = scores.av_soft;
        }
        if (confidence < 0.28) {
            profile = PROFILES.unknown;
            confidence = clamp01(confidence);
        }

        const uniqueReasons = [...new Set(reasons)];
        return {
            profile,
            confidence: clamp01(confidence),
            label: PROFILE_LABELS[profile] || PROFILE_LABELS.unknown,
            reasons: uniqueReasons,
            presetId: PROFILE_PRESET_IDS[profile] || null,
            scores,
            strongAv: !!strongAv,
        };
    }

    /**
     * Consensus across a batch. Mixed high-confidence profiles → unknown (no auto-apply).
     * @param {Array<{ path?: string, fileName?: string, durationSec?: number }>} items
     * @param {{ language?: string, task?: string }} baseOptions
     */
    function classifyBatchContentProfile(items = [], baseOptions = {}) {
        const list = Array.isArray(items) ? items.filter(Boolean) : [];
        if (!list.length) {
            return {
                profile: PROFILES.unknown,
                confidence: 0,
                label: PROFILE_LABELS.unknown,
                reasons: [],
                presetId: null,
                perItem: [],
                mixed: false,
            };
        }

        const perItem = list.map((item) => classifyContentProfile({
            path: item.path || item.fullPath || item.fileName,
            fileName: item.fileName,
            durationSec: item.durationSec ?? item.duration,
            language: baseOptions.language,
            task: baseOptions.task,
        }));

        const counts = { av_soft: 0, film: 0, talk: 0, unknown: 0 };
        let weightSum = { av_soft: 0, film: 0, talk: 0 };
        for (const row of perItem) {
            counts[row.profile] = (counts[row.profile] || 0) + 1;
            if (row.profile !== 'unknown') {
                weightSum[row.profile] += row.confidence;
            }
        }

        const decisive = perItem.filter((r) => r.profile !== 'unknown' && r.confidence >= 0.4);
        const distinct = new Set(decisive.map((r) => r.profile));
        if (distinct.size > 1) {
            return {
                profile: PROFILES.unknown,
                confidence: 0,
                label: PROFILE_LABELS.unknown,
                reasons: ['批次内类型不一致'],
                presetId: null,
                perItem,
                mixed: true,
                counts,
            };
        }

        let best = PROFILES.unknown;
        let bestCount = 0;
        for (const key of ['av_soft', 'film', 'talk']) {
            if (counts[key] > bestCount) {
                bestCount = counts[key];
                best = key;
            }
        }
        if (bestCount === 0) {
            return {
                profile: PROFILES.unknown,
                confidence: 0,
                label: PROFILE_LABELS.unknown,
                reasons: [],
                presetId: null,
                perItem,
                mixed: false,
                counts,
            };
        }

        const confidence = clamp01(weightSum[best] / bestCount);
        const reasons = [...new Set(perItem.flatMap((r) => (r.profile === best ? r.reasons : [])))];
        return {
            profile: best,
            confidence,
            label: PROFILE_LABELS[best],
            reasons,
            presetId: PROFILE_PRESET_IDS[best] || null,
            perItem,
            mixed: false,
            counts,
        };
    }

    function isTranslateLikeTask(task) {
        const t = String(task || '').toLowerCase();
        return t === 'translate' || t === 'dual';
    }

    /**
     * Build sense patch for a profile. MT model only when task is translate/dual.
     */
    function optionPatchForProfile(profile, options = {}) {
        let patch = {};
        if (profile === PROFILES.av_soft) patch = { ...AV_SOFT_PATCH };
        else if (profile === PROFILES.talk) patch = { ...TALK_PATCH };
        else if (profile === PROFILES.film) {
            patch = options.advancedEntitled === false
                ? { ...FILM_FREE_PATCH }
                : { ...FILM_PATCH };
        }
        if (!isTranslateLikeTask(options.task) && Object.prototype.hasOwnProperty.call(patch, 'engineMtModel')) {
            const { engineMtModel, ...rest } = patch;
            patch = rest;
        }
        return patch;
    }

    /**
     * Soft-merge sense patch onto base options (sense-owned keys only).
     */
    function mergeContentProfileOptions(base = {}, patch = {}, ownedKeys = SENSE_OWNED_KEYS) {
        const out = { ...base };
        const applied = [];
        const keys = Array.isArray(ownedKeys) ? ownedKeys : SENSE_OWNED_KEYS;
        for (const key of keys) {
            if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
            if (out[key] === patch[key]) continue;
            out[key] = patch[key];
            applied.push(key);
        }
        return { options: out, appliedKeys: applied };
    }

    /**
     * Extract only sense-owned keys from a patch (for per-item optionOverrides).
     */
    function pickSenseOverrides(patch = {}) {
        const out = {};
        for (const key of SENSE_OWNED_KEYS) {
            if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
            out[key] = patch[key];
        }
        return out;
    }

    /**
     * Merge batch base options with per-item sense overrides (sense-owned keys only).
     */
    function mergeSenseOverrides(base = {}, overrides = {}) {
        if (!overrides || typeof overrides !== 'object') return { ...base };
        const { options } = mergeContentProfileOptions(base, overrides, SENSE_OWNED_KEYS);
        return options;
    }

    const OPUS_MT_BY_LANG = Object.freeze({
        ja: 'opus-mt-ja-zh',
        en: 'opus-mt-en-zh',
        ko: 'opus-mt-ko-zh',
        de: 'opus-mt-de-zh',
        es: 'opus-mt-es-zh',
        fi: 'opus-mt-fi-zh',
        sv: 'opus-mt-sv-zh',
    });

    /** Fallback general LLM ids when managed catalog is unavailable (non-Sakura). */
    const GENERAL_LLM_MT_FALLBACK = Object.freeze([
        'qwen25-7b', 'qwen25-3b', 'qwen25-1.5b',
        'qwen3-4b', 'qwen3-1.7b',
    ]);

    function isSakuraMtId(id) {
        return /^sakura-/i.test(String(id || '').trim());
    }

    function isOpusMtId(id) {
        const s = String(id || '').trim().toLowerCase();
        if (!s) return false;
        return /^opus[-_]?mt[-_]/i.test(s) || s.includes('opus-mt-');
    }

    /**
     * Preferred non-Sakura LLM ids for sense (推理翻译). Prefer free-pipeline catalog order.
     */
    function listPreferredGeneralLlmMtIds() {
        try {
            let api = null;
            if (typeof require !== 'undefined') {
                try { api = require('./advanced-managed-llm-catalog-core'); } catch { /* browser */ }
            }
            if (!api && typeof globalThis !== 'undefined') {
                api = globalThis.TransubAdvancedManagedLlmCatalog || null;
            }
            const list = api?.listFreePipelineTranslateModels?.() || [];
            const ids = list
                .map((m) => String(m?.id || '').trim())
                .filter((id) => id && !isSakuraMtId(id));
            // Recommended / larger first among free-pipeline
            const recommended = list
                .filter((m) => m?.recommended && !isSakuraMtId(m.id))
                .map((m) => String(m.id));
            const ordered = [...recommended, ...ids.filter((id) => !recommended.includes(id))];
            if (ordered.length) return ordered;
        } catch { /* ignore */ }
        return [...GENERAL_LLM_MT_FALLBACK];
    }

    function normalizeSenseLang(language) {
        const lang = String(language || '').trim().toLowerCase();
        if (!lang || lang === 'auto') return '';
        if (lang === 'japanese' || lang === 'jp') return 'ja';
        if (lang === 'korean') return 'ko';
        if (lang === 'english') return 'en';
        if (lang === 'chinese' || lang === 'zh-cn' || lang === 'zh-hans') return 'zh';
        return lang.split('-')[0];
    }

    function buildInstalledSet(installedModels) {
        const set = new Set();
        const list = Array.isArray(installedModels) ? installedModels : [];
        for (const row of list) {
            if (!row) continue;
            if (typeof row === 'string') {
                set.add(row);
                continue;
            }
            if (row.installed === false) continue;
            const id = String(row.id || '').trim();
            if (id) set.add(id);
        }
        // Silero is often treated as always available in engine catalog
        if (!set.has('silero-vad') && list.some((m) => m && m.id === 'silero-vad')) {
            set.add('silero-vad');
        }
        return set;
    }

    function firstInstalled(candidates, installedSet) {
        for (const id of candidates) {
            if (id && installedSet.has(id)) return id;
        }
        return '';
    }

    /**
     * Refine sense overrides to prefer installed models for language + profile.
     * Does not invent keys unrelated to sense; drops ASR/MT/VAD ids that are not installed
     * when a better installed fallback exists.
     *
     * @param {object} overrides
     * @param {{
     *   profile?: string,
     *   language?: string,
     *   task?: string,
     *   installedModels?: Array<{id:string,installed?:boolean}|string>,
     * }} ctx
     * @returns {{ overrides: object, notes: string[] }}
     */
    function refineSenseModels(overrides = {}, ctx = {}) {
        const out = { ...overrides };
        const notes = [];
        const installed = buildInstalledSet(ctx.installedModels);
        const profile = ctx.profile || PROFILES.unknown;
        const lang = normalizeSenseLang(ctx.language || out.language || '');
        const translateLike = isTranslateLikeTask(ctx.task);

        if (lang && !out.language) out.language = lang;

        // ASR preference by profile / language
        const asrWanted = [];
        if (profile === PROFILES.av_soft || (lang === 'ja' && profile !== PROFILES.film)) {
            asrWanted.push('whisper-ja-1.5b', 'whisper-large-v3-turbo', 'whisper-large-v3', 'sensevoice-small');
        } else if (profile === PROFILES.film) {
            asrWanted.push('whisper-large-v3-turbo', 'whisper-large-v3', 'sensevoice-small');
        } else if (lang === 'zh' || lang === 'en' || lang === 'ko') {
            asrWanted.push('sensevoice-small', 'whisper-large-v3-turbo', 'whisper-tiny');
        } else {
            asrWanted.push(
                out.engineAsrModel || '',
                'sensevoice-small',
                'whisper-large-v3-turbo',
                'whisper-tiny',
            );
        }
        if (out.engineAsrModel && !asrWanted.includes(out.engineAsrModel)) {
            asrWanted.unshift(out.engineAsrModel);
        }
        if (installed.size) {
            const asr = firstInstalled(asrWanted.filter(Boolean), installed);
            if (asr && asr !== out.engineAsrModel) {
                if (out.engineAsrModel && !installed.has(out.engineAsrModel)) {
                    notes.push(`ASR ${out.engineAsrModel} 未安装 → ${asr}`);
                } else if (!out.engineAsrModel) {
                    notes.push(`ASR → ${asr}`);
                } else if (asr !== out.engineAsrModel) {
                    notes.push(`ASR ${out.engineAsrModel} → ${asr}`);
                }
                out.engineAsrModel = asr;
            } else if (out.engineAsrModel && !installed.has(out.engineAsrModel)) {
                notes.push(`ASR ${out.engineAsrModel} 未安装，已移除`);
                delete out.engineAsrModel;
            }
        }

        // VAD: keep profile choice if installed, else fall back
        if (out.engineVadModel && installed.size && !installed.has(out.engineVadModel)) {
            const vadAlt = out.engineVadModel.includes('whisperseg')
                ? firstInstalled(['silero-vad', 'fsmn-vad'], installed)
                : firstInstalled(['fsmn-vad', 'silero-vad'], installed);
            if (vadAlt) {
                notes.push(`VAD ${out.engineVadModel} 未安装 → ${vadAlt}`);
                out.engineVadModel = vadAlt;
                if (!vadAlt.includes('whisperseg')) {
                    out.vadSensitive = false;
                }
            }
        }

        // SenseVoice / FunASR cannot load Silero or WhisperSeg — force fsmn-vad.
        const asrFinal = String(out.engineAsrModel || '').toLowerCase();
        if (asrFinal && !asrFinal.includes('whisper')) {
            const vadFinal = String(out.engineVadModel || '').toLowerCase();
            if (
                vadFinal.includes('whisperseg')
                || vadFinal === 'silero-vad'
                || vadFinal === 'silero'
            ) {
                notes.push(`VAD ${out.engineVadModel} 与 SenseVoice 不兼容 → fsmn-vad`);
                out.engineVadModel = 'fsmn-vad';
                out.vadSensitive = false;
            }
        }

        // MT: prefer 推理翻译 (Sakura for JA / general LLM otherwise); Opus 机器翻译 only as last resort.
        if (translateLike) {
            // Sakura is JA→ZH only — never for known non-Japanese.
            const allowSakura = lang === 'ja'
                || (profile === PROFILES.av_soft && !lang);
            const sakuraWanted = allowSakura ? ['sakura-1.5b', 'sakura-7b'] : [];
            const sakuraHit = firstInstalled(sakuraWanted, installed);
            const generalLlmWanted = listPreferredGeneralLlmMtIds();
            const generalLlmHit = firstInstalled(generalLlmWanted, installed);
            const opusWanted = OPUS_MT_BY_LANG[lang] || '';
            const curMt = String(out.engineMtModel || '').trim();
            const mtIsSakura = isSakuraMtId(curMt);
            const mtIsOpus = isOpusMtId(curMt);

            const setMt = (next, note) => {
                if (!next) return;
                if (out.engineMtModel !== next) {
                    notes.push(note || (out.engineMtModel
                        ? `MT ${out.engineMtModel} → ${next}`
                        : `MT → ${next}`));
                }
                out.engineMtModel = next;
            };
            const clearMt = (note) => {
                if (Object.prototype.hasOwnProperty.call(out, 'engineMtModel')) {
                    if (note) notes.push(note);
                    delete out.engineMtModel;
                }
            };

            if (allowSakura) {
                if (sakuraHit) {
                    setMt(sakuraHit);
                } else if (generalLlmHit) {
                    // Prefer any installed 推理翻译 over Opus when Sakura is missing.
                    setMt(generalLlmHit, out.engineMtModel
                        ? `Sakura 未装 · 推理 ${out.engineMtModel} → ${generalLlmHit}`
                        : `Sakura 未装 · 推理 → ${generalLlmHit}`);
                } else if (opusWanted && (!installed.size || installed.has(opusWanted))) {
                    setMt(opusWanted, out.engineMtModel
                        ? `推理未装 · MT ${out.engineMtModel} → ${opusWanted}`
                        : `推理未装 · MT → ${opusWanted}`);
                } else {
                    // Keep Sakura as declared target so preflight asks for it (not silent Opus).
                    const prefer = sakuraWanted[0];
                    setMt(prefer, out.engineMtModel
                        ? `MT ${out.engineMtModel} → ${prefer}（待下载）`
                        : `MT → ${prefer}（待下载）`);
                }
            } else {
                // Non-Japanese: never Sakura. Prefer general LLM; avoid forcing Opus.
                if (mtIsSakura || !curMt || mtIsOpus) {
                    if (generalLlmHit) {
                        setMt(generalLlmHit, mtIsSakura
                            ? `非日语 · 禁用 Sakura · 推理 → ${generalLlmHit}`
                            : (mtIsOpus
                                ? `优先推理翻译 · MT ${curMt} → ${generalLlmHit}`
                                : `优先推理翻译 · MT → ${generalLlmHit}`));
                    } else if (mtIsSakura) {
                        // No LLM installed: drop Sakura; do not force Opus (form/engine may still choose).
                        clearMt(`非日语（${lang || '?'}）· 禁用 Sakura · 未强制机器翻译`);
                    } else if (mtIsOpus) {
                        // Sense should not lock Opus when inference is preferred and unavailable —
                        // clear override so form translate-mode can win.
                        clearMt(`感知不强制机器翻译 · 已移除 ${curMt}`);
                    }
                    // else: empty MT — leave unset (inherit form)
                } else if (curMt && installed.size && !installed.has(curMt) && generalLlmHit) {
                    setMt(generalLlmHit, `MT ${curMt} 未安装 → 推理 ${generalLlmHit}`);
                }
            }
            if (lang && lang !== 'ja' && Object.prototype.hasOwnProperty.call(out, 'sakuraNsfwPrompt')) {
                out.sakuraNsfwPrompt = false;
            }
        } else if (Object.prototype.hasOwnProperty.call(out, 'engineMtModel')) {
            delete out.engineMtModel;
        }

        return { overrides: out, notes };
    }

    /**
     * Ideal support items / models for an adopted sense scheme (before install fallbacks).
     * @returns {Array<{ id: string, kind: 'model'|'demucs', role: string, label: string, altIds?: string[] }>}
     */
    function listSensePreferredSupport(overrides = {}, ctx = {}) {
        const items = [];
        const seen = new Set();
        const push = (entry) => {
            if (!entry?.id) return;
            const key = `${entry.kind || 'model'}:${entry.id}`;
            if (seen.has(key)) return;
            seen.add(key);
            items.push(entry);
        };

        const profile = ctx.profile || PROFILES.unknown;
        const lang = normalizeSenseLang(ctx.language || overrides.language || '');
        const translateLike = isTranslateLikeTask(ctx.task);
        const jaAv = profile === PROFILES.av_soft || (lang === 'ja' && profile !== PROFILES.film);
        const allowSakuraMt = lang === 'ja'
            || (profile === PROFILES.av_soft && !lang);

        if (jaAv) {
            push({
                id: 'whisper-ja-1.5b',
                kind: 'model',
                role: 'asr',
                label: '日语识别 whisper-ja-1.5b',
                altIds: [],
            });
        } else if (profile === PROFILES.film) {
            push({
                id: 'whisper-large-v3-turbo',
                kind: 'model',
                role: 'asr',
                label: '识别 whisper-large-v3-turbo',
                altIds: ['whisper-large-v3'],
            });
        } else if (overrides.engineAsrModel) {
            push({
                id: String(overrides.engineAsrModel),
                kind: 'model',
                role: 'asr',
                label: `识别 ${overrides.engineAsrModel}`,
            });
        }

        const vadFromOverride = String(overrides.engineVadModel || '').trim();
        if (
            profile === PROFILES.av_soft
            || overrides.vadSensitive
            || vadFromOverride.includes('whisperseg')
        ) {
            push({
                id: vadFromOverride.includes('whisperseg') ? vadFromOverride : 'whisperseg-asmr',
                kind: 'model',
                role: 'vad',
                label: '灵敏 VAD whisperseg-asmr',
            });
        }

        if (translateLike) {
            if (allowSakuraMt) {
                push({
                    id: 'sakura-1.5b',
                    kind: 'model',
                    role: 'mt',
                    label: 'Sakura 译中 sakura-1.5b',
                    altIds: ['sakura-7b', ...listPreferredGeneralLlmMtIds().slice(0, 3)],
                });
            } else {
                const llmPrefer = listPreferredGeneralLlmMtIds();
                const cur = String(overrides.engineMtModel || '').trim();
                const curOk = cur && !isSakuraMtId(cur) && !isOpusMtId(cur);
                const id = curOk ? cur : (llmPrefer[0] || '');
                if (id) {
                    push({
                        id,
                        kind: 'model',
                        role: 'mt',
                        label: `推理翻译 ${id}`,
                        altIds: llmPrefer.filter((x) => x !== id).slice(0, 4),
                    });
                }
            }
        }

        if (overrides.filmAudioEnhance) {
            push({
                id: 'demucs',
                kind: 'demucs',
                role: 'support',
                label: 'Demucs（影视人声分离）',
            });
        }

        return items;
    }

    function isSenseSupportInstalled(entry, installedSet, ctx = {}) {
        if (!entry) return true;
        if (entry.kind === 'demucs') return ctx.demucsReady === true;
        if (entry.kind === 'gpu') return ctx.gpuReady === true;
        const ids = [entry.id, ...(Array.isArray(entry.altIds) ? entry.altIds : [])]
            .map((id) => String(id || '').trim())
            .filter(Boolean);
        return ids.some((id) => installedSet.has(id));
    }

    /**
     * Preferred sense support vs what is actually installed / ready.
     * @returns {{ preferred: object[], missing: object[] }}
     */
    function collectSenseSupportGaps(overrides = {}, ctx = {}) {
        const preferred = listSensePreferredSupport(overrides, ctx);
        const installed = buildInstalledSet(ctx.installedModels);
        const missing = preferred.filter((entry) => !isSenseSupportInstalled(entry, installed, ctx));
        return { preferred, missing };
    }

    /**
     * Merge missing support rows from multiple sense items (dedupe by kind:id).
     * @param {Array<{ missing?: object[] }|object[]>} gapLists
     * @returns {object[]}
     */
    function mergeSenseSupportGaps(gapLists = []) {
        const out = [];
        const seen = new Set();
        for (const row of gapLists) {
            const list = Array.isArray(row?.missing)
                ? row.missing
                : (Array.isArray(row) ? row : []);
            for (const entry of list) {
                if (!entry?.id) continue;
                const key = `${entry.kind || 'model'}:${entry.id}`;
                if (seen.has(key)) continue;
                seen.add(key);
                out.push(entry);
            }
        }
        return out;
    }

    /**
     * Resolve auto-sense for one media item (import-time / re-sense).
     * @returns {{
     *   action: 'apply'|'suggest'|'skip',
     *   adopted: boolean,
     *   classification,
     *   overrides: object,
     *   options?: object,
     *   appliedKeys?: string[],
     *   message: string,
     * }}
     */
    function resolveItemSense(input = {}, baseOptions = {}, prefs = {}) {
        const enabled = prefs.autoSense !== false
            && prefs.autoContentProfile !== false;
        let classification = classifyContentProfile({
            path: input.path || input.fullPath || input.fileName,
            fileName: input.fileName,
            durationSec: input.durationSec ?? input.duration,
            language: baseOptions.language,
            task: baseOptions.task,
        });

        const mem = applySenseMemoryToClassification(classification, prefs.memoryHits || []);
        classification = mem.classification || classification;
        const memoryNote = mem.memoryNote || '';
        const forceSuggest = !!mem.forceSuggest;
        const forceAdopt = !!mem.forceAdopt;

        if (!enabled) {
            return {
                action: 'skip',
                adopted: false,
                classification,
                overrides: {},
                message: '',
            };
        }

        const advancedEntitled = prefs.advancedEntitled !== false
            && baseOptions.advancedEntitled !== false;
        const manual = hasManualAudioProfile(baseOptions);
        const patch = optionPatchForProfile(classification.profile, {
            advancedEntitled,
            task: baseOptions.task,
        });

        if (classification.profile === PROFILES.unknown || classification.confidence < 0.28) {
            return {
                action: 'skip',
                adopted: false,
                classification,
                overrides: {},
                message: memoryNote,
            };
        }

        const confPct = Math.round(classification.confidence * 100);
        const reasonText = classification.reasons.length
            ? `（${classification.reasons.slice(0, 3).join(' · ')}）`
            : '';
        const memSuffix = memoryNote ? ` · ${memoryNote}` : '';
        const overrides = pickSenseOverrides(patch);

        // Memory reject: keep result visible but do not auto-adopt.
        if (forceSuggest && !forceAdopt) {
            return {
                action: 'suggest',
                adopted: false,
                classification,
                overrides,
                message: `识别为「${classification.label}」置信度 ${confPct}%${reasonText}${memSuffix}；未自动采纳`,
            };
        }

        const { options, appliedKeys } = mergeContentProfileOptions(baseOptions, patch);
        if (!appliedKeys.length && !Object.keys(overrides).length) {
            return {
                action: 'skip',
                adopted: false,
                classification,
                overrides,
                options,
                appliedKeys,
                message: memoryNote,
            };
        }

        const method = describeAudioMethod(Object.keys(overrides).length
            ? { ...baseOptions, ...overrides }
            : options);
        const langNote = overrides.language ? ` · 语种 ${overrides.language}` : '';
        const manualNote = manual
            ? '；已覆盖表单中的音频/VAD（可点不采纳）'
            : '';
        const softNote = !forceAdopt && classification.confidence < APPLY_CONFIDENCE
            ? '；置信度偏低仍已默认采纳'
            : '';

        return {
            action: 'apply',
            adopted: true,
            classification,
            overrides,
            options: Object.keys(overrides).length
                ? { ...baseOptions, ...overrides }
                : options,
            appliedKeys: appliedKeys.length ? appliedKeys : Object.keys(overrides),
            message: `感知「${classification.label}」置信度 ${confPct}%${reasonText} → ${method.short}${langNote}${manualNote}${softNote}${memSuffix}`,
        };
    }

    /**
     * Hard guard: Sakura is JA→ZH only. When source language is known non-Japanese,
     * strip Sakura MT. Prefer a general LLM when provided via installedModels; never
     * force Opus 机器翻译 here (form / engine may still choose it if needed).
     * @param {object} options
     * @param {string} [language]
     * @param {{ installedModels?: Array<{id:string,installed?:boolean}|string> }} [ctx]
     * @returns {{ options: object, changed: boolean, note: string }}
     */
    function sanitizeSakuraMtForLanguage(options = {}, language, ctx = {}) {
        const out = { ...(options || {}) };
        const lang = normalizeSenseLang(language || out.language || '');
        if (!lang || lang === 'ja') {
            return { options: out, changed: false, note: '' };
        }
        const mt = String(out.engineMtModel || '').trim();
        if (!isSakuraMtId(mt)) {
            if (Object.prototype.hasOwnProperty.call(out, 'sakuraNsfwPrompt') && out.sakuraNsfwPrompt) {
                out.sakuraNsfwPrompt = false;
                return { options: out, changed: true, note: `非日语（${lang}）· 关闭 Sakura NSFW 提示` };
            }
            return { options: out, changed: false, note: '' };
        }
        const installed = buildInstalledSet(ctx.installedModels);
        const llmHit = firstInstalled(listPreferredGeneralLlmMtIds(), installed);
        out.sakuraNsfwPrompt = false;
        if (llmHit) {
            out.engineMtModel = llmHit;
            return {
                options: out,
                changed: true,
                note: `非日语（${lang}）· 禁用 Sakura · 推理 → ${llmHit}`,
            };
        }
        delete out.engineMtModel;
        return {
            options: out,
            changed: true,
            note: `非日语（${lang}）· 禁用 Sakura · 未强制机器翻译`,
        };
    }

    /**
     * @deprecated Prefer resolveItemSense for per-file auto-sense.
     * Kept for transitional tests; batch consensus no longer used at Start.
     */
    function resolveContentProfileForJob(items, baseOptions = {}, prefs = {}) {
        const list = Array.isArray(items) ? items.filter(Boolean) : [];
        if (list.length === 1) {
            return resolveItemSense(list[0], baseOptions, {
                ...prefs,
                autoSense: prefs.autoSense !== false && prefs.autoContentProfile !== false,
            });
        }
        const enabled = prefs.autoSense !== false && prefs.autoContentProfile !== false;
        const classification = classifyBatchContentProfile(items, baseOptions);
        if (!enabled) {
            return {
                action: 'skip',
                adopted: false,
                classification,
                patch: {},
                overrides: {},
                message: '',
            };
        }
        if (classification.mixed) {
            return {
                action: 'suggest',
                adopted: false,
                classification,
                patch: {},
                overrides: {},
                message: '素材类型不一致；请按文件分别感知',
            };
        }
        const first = list[0] || {};
        return resolveItemSense(first, baseOptions, prefs);
    }

    /**
     * Post-batch reconstruct suggestion (editor workflows). No auto-run.
     * @param {{ profile?: string, task?: string }} input
     * @returns {{ mode: 'film'|'basic'|'none', message: string }}
     */
    function suggestPostReconstructMode(input = {}) {
        const profile = input.profile || PROFILES.unknown;
        const task = String(input.task || '').toLowerCase();
        const translateLike = task === 'translate' || task === 'dual';
        if (!translateLike && task !== 'transcribe') {
            return { mode: 'none', message: '' };
        }
        if (profile === PROFILES.film) {
            return {
                mode: 'film',
                message: '建议：在字幕编辑器中使用「影片理解重构」，按场景统一人物与专名',
            };
        }
        if (profile === PROFILES.av_soft || profile === PROFILES.talk) {
            return {
                mode: 'basic',
                message: '建议：在字幕编辑器中使用「语境重构」，改善局部不通顺处',
            };
        }
        return { mode: 'none', message: '' };
    }

    function formatClassificationLog(classification) {
        if (!classification || classification.profile === PROFILES.unknown) return '';
        const confPct = Math.round((classification.confidence || 0) * 100);
        const reasons = (classification.reasons || []).slice(0, 3).join(' · ');
        return reasons
            ? `素材类型：${classification.label}（${confPct}% · ${reasons}）`
            : `素材类型：${classification.label}（${confPct}%）`;
    }

    /** Short badge text for list rows. */
    const PROFILE_BADGES = Object.freeze({
        av_soft: 'AV',
        film: '影视',
        talk: '访谈',
        unknown: '',
    });

    /**
     * Effective audio / VAD method from options (after any soft-merge).
     * @returns {{ id: string, label: string, short: string }}
     */
    function describeAudioMethod(options = {}) {
        if (options.filmAudioEnhance) {
            return { id: 'film_enhance', label: '影视音频增强（Demucs）', short: 'Demucs' };
        }
        if (options.filmVadPreset) {
            return { id: 'film_vad', label: '影视 VAD 预设', short: '影视VAD' };
        }
        const vad = String(options.engineVadModel || '').toLowerCase();
        if (options.vadSensitive || vad.includes('whisperseg')) {
            return { id: 'sensitive', label: '灵敏检出（WhisperSeg）', short: '灵敏' };
        }
        if (options.vadAggressive) {
            return { id: 'aggressive', label: '激进切分', short: '激进' };
        }
        if (options.audioLightDenoise) {
            return { id: 'denoise', label: '轻度降噪', short: '降噪' };
        }
        return { id: 'default', label: '默认音频 / VAD', short: '默认' };
    }

    function profileBadge(profile) {
        return PROFILE_BADGES[profile] || '';
    }

    /**
     * Build UI-facing summary for toolbar auto-sense switch + detail line.
     * @param {{
     *   autoEnabled?: boolean,
     *   sensingCount?: number,
     *   adoptedCount?: number,
     *   doneCount?: number,
     *   itemCount?: number,
     * }} input
     */
    function describeAutoSenseUi(input = {}) {
        const autoEnabled = input.autoEnabled !== false;
        const sensingCount = Number(input.sensingCount) || 0;
        const adoptedCount = Number(input.adoptedCount) || 0;
        const doneCount = Number(input.doneCount) || 0;
        const itemCount = Number(input.itemCount) || 0;

        if (!autoEnabled) {
            return {
                tone: 'off',
                chipLabel: '感知 · 关',
                detail: '智能感知已关闭 · 按表单参数生成',
                title: '关闭后新文件不再感知；已有结果不参与生成',
            };
        }
        if (sensingCount > 0) {
            return {
                tone: 'apply',
                chipLabel: `感知中 ${sensingCount}`,
                detail: `正在分析素材类型与参数（${sensingCount}）`,
                title: '智能感知进行中',
            };
        }
        if (adoptedCount > 0) {
            return {
                tone: 'apply',
                chipLabel: `已采纳 ${adoptedCount}`,
                detail: '',
                title: `已采纳 ${adoptedCount} 项：开始时按文件覆盖参数（见列表文件名旁图标）`,
            };
        }
        if (doneCount > 0) {
            return {
                tone: 'suggest',
                chipLabel: `已感知 ${doneCount}`,
                detail: '有感知结果但未采纳（可点行内采纳）',
                title: '感知完成但未采纳',
            };
        }
        if (itemCount > 0) {
            return {
                tone: 'idle',
                chipLabel: '感知 · 开',
                detail: '拖入后自动分析并默认采纳',
                title: '智能感知已开启；结果默认采纳，可点不采纳',
            };
        }
        return {
            tone: 'idle',
            chipLabel: '感知 · 开',
            detail: '拖入视频后自动分析类型与参数（默认采纳）',
            title: '智能感知已开启；结果默认采纳，可点不采纳',
        };
    }

    /** @deprecated Use describeAutoSenseUi */
    function describeContentProfileUi(input = {}) {
        if (input && (input.sensingCount != null || input.adoptedCount != null || input.itemCount != null)) {
            return describeAutoSenseUi(input);
        }
        const autoEnabled = input.autoEnabled !== false;
        if (!autoEnabled) {
            return describeAutoSenseUi({ autoEnabled: false });
        }
        return describeAutoSenseUi({
            autoEnabled: true,
            itemCount: Number(input.selectedCount) || 0,
        });
    }

    return {
        PROFILES,
        PROFILE_LABELS,
        PROFILE_BADGES,
        PROFILE_OWNED_KEYS,
        SENSE_OWNED_KEYS,
        APPLY_CONFIDENCE,
        KNOWN_AV_MAKERS,
        AV_SOFT_PATCH,
        FILM_PATCH,
        FILM_FREE_PATCH,
        TALK_PATCH,
        classifyContentProfile,
        classifyBatchContentProfile,
        optionPatchForProfile,
        mergeContentProfileOptions,
        mergeSenseOverrides,
        pickSenseOverrides,
        refineSenseModels,
        listSensePreferredSupport,
        collectSenseSupportGaps,
        mergeSenseSupportGaps,
        sanitizeSakuraMtForLanguage,
        OPUS_MT_BY_LANG,
        normalizeSenseLang,
        hasManualAudioProfile,
        resolveItemSense,
        resolveContentProfileForJob,
        guessLanguageFromName,
        isFilenameSenseConfident,
        isInstantAvSenseCandidate,
        shouldSniffSpokenLanguage,
        resolveSenseSniffWindow,
        shouldPreferSniffLanguage,
        priorFromMetaLanguage,
        buildSenseMemoryKeys,
        applySenseMemoryToClassification,
        applyAcousticHints,
        shouldProbeAcoustic,
        suggestPostReconstructMode,
        formatClassificationLog,
        describeAudioMethod,
        describeAutoSenseUi,
        describeContentProfileUi,
        profileBadge,
        extractAvCodes,
        extractAvCodesFromPath,
        basenameOf,
    };
}));
