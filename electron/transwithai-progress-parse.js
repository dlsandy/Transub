/**
 * TWAI infer progress parsing (pure) — feature-frozen path, structure-only extract.
 */
'use strict';

function parseChineseDurationSeconds(text) {
    const src = String(text || '');
    let sec = 0;
    const h = src.match(/(\d+)小时/);
    const m = src.match(/(\d+)分/);
    const s = src.match(/([\d.]+)秒/);
    if (h) sec += Number(h[1]) * 3600;
    if (m) sec += Number(m[1]) * 60;
    if (s) sec += Number(s[1]);
    return sec;
}

/** 将秒数格式化为 m:ss 或 h:mm:ss（用于视频时间轴） */
function formatMediaTime(totalSec) {
    const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
}

/** 解析 infer 日志中的 MM:SS.ss 时间戳（分钟可超过 59） */
function parseInferTimestampMinutesSeconds(minStr, secStr) {
    return Number(minStr) * 60 + Number(secStr);
}

/** LRC 时间戳 MM:SS.cc（centiseconds）→ 秒 */
function parseLrcTimestampSeconds(minStr, secStr) {
    const min = Number(minStr) || 0;
    const secParts = String(secStr || '0').split('.');
    const sec = Number(secParts[0]) || 0;
    const cs = Number(secParts[1]) || 0;
    return min * 60 + sec + cs / 100;
}

/** 将 infer 各阶段局部进度映射为整条流水线 0–100%（与 engine remap_job_progress 对齐） */
function mapInferStageProgress(stage, rawPct = 0, videoCurrentSec = 0, videoTotalSec = 0) {
    const local = Math.max(0, Math.min(100, Number(rawPct) || 0));
    const mediaSec = Number(videoTotalSec) || 0;
    const currentSec = Number(videoCurrentSec) || 0;
    const scaleBand = (pct, lo, hi) => Math.round(lo + (Math.max(0, Math.min(100, pct)) / 100) * (hi - lo));

    switch (stage) {
        case 'starting':
        case 'vad':
        case 'model':
            return Math.min(5, scaleBand(Math.max(local, 5), 1, 5));
        case 'cleanup':
            return scaleBand(local, 95, 97);
        case 'source_cleanup':
        case 'semantic_repair':
            return scaleBand(local, 62, 65);
        case 'transcribe': {
            const timelinePct = mediaSec >= 60
                ? Math.min(100, Math.round((currentSec / mediaSec) * 100))
                : local;
            return Math.min(65, Math.round(5 + (timelinePct / 100) * 60));
        }
        case 'translate': {
            if (local <= 8) return scaleBand((local / 8) * 100, 65, 70);
            return scaleBand(((local - 8) / 92) * 100, 70, 95);
        }
        case 'qc_fix':
            return scaleBand(local, 98, 100);
        case 'save':
            return scaleBand(local, 97, 98);
        case 'done':
            return 100;
        default:
            return inferStageRank(stage) >= INFER_STAGE_RANK.transcribe
                ? Math.min(96, local)
                : 0;
    }
}

/** 转写阶段墙钟时间约为片长的倍数（GPU 翻译经验值） */
const TRANSCRIBE_WALL_FACTOR = 0.35;
const SYNTHETIC_PROGRESS_INTERVAL_MS = 3000;

const INFER_STAGE_RANK = {
    starting: 0,
    vad: 1,
    model: 2,
    transcribe: 3,
    save: 4,
    done: 5,
};

function inferStageRank(stage) {
    return INFER_STAGE_RANK[stage] ?? 0;
}

function buildSyntheticTranscribeUpdate(mediaDurationSec, transcribeStartedAt, parseState = {}) {
    if (!mediaDurationSec || !transcribeStartedAt) return null;
    const elapsed = Math.max(0, (Date.now() - transcribeStartedAt) / 1000);
    const expectedWall = Math.max(45, mediaDurationSec * TRANSCRIBE_WALL_FACTOR);
    const ratio = Math.min(0.98, elapsed / expectedWall);
    const videoCurrentSec = Math.round(mediaDurationSec * ratio);
    const videoProgress = Math.min(65, Math.round(5 + ratio * 60));
    const totalSec = parseState.mediaTotalSec || mediaDurationSec;
    return {
        stage: 'transcribe',
        videoProgress,
        videoCurrentSec,
        videoTotalSec: totalSec,
        detail: `${formatMediaTime(videoCurrentSec)} / ${formatMediaTime(totalSec)}`,
    };
}

function mapPipelinePercent(stage, rawPct, videoCurrentSec, videoTotalSec) {
    return mapInferStageProgress(stage, rawPct, videoCurrentSec, videoTotalSec);
}

function parseInferProgressLine(line, parseState = {}) {
    const text = String(line || '').trim();
    if (!text) return null;

    if (/正在初始化增强VAD/.test(text)) {
        return { stage: 'vad', videoProgress: 0, detail: '初始化语音检测…' };
    }
    if (/增强VAD已激活/.test(text)) {
        return { stage: 'vad', videoProgress: 0, detail: '语音检测就绪' };
    }

    const vadProgressMatch = text.match(/VAD进度：\s*(\d+)\s*\/\s*(\d+)\s*块（([\d.]+)%）/);
    if (vadProgressMatch) {
        const current = Number(vadProgressMatch[1]) || 0;
        const total = Number(vadProgressMatch[2]) || 0;
        const pct = Math.max(0, Math.min(100, Math.round(Number(vadProgressMatch[3]) || 0)));
        const detail = total > 0 ? `语音检测 ${current}/${total} 块 · ${pct}%` : `语音检测 · ${pct}%`;
        // VAD 块进度仅用于详情文案，不写入 videoProgress / 时间轴，避免计入任务百分比
        return {
            stage: 'vad',
            videoProgress: 0,
            detail,
        };
    }

    if (/正在加载Whisper模型/.test(text)) {
        return { stage: 'model', videoProgress: 0, detail: '加载模型…' };
    }
    if (/模型运行精度/.test(text)) {
        return { stage: 'model', videoProgress: 0, detail: '模型已就绪' };
    }

    const processingMatch = text.match(/正在处理（[^，]+，\s*(\d+)\s*\/\s*(\d+)）/);
    if (processingMatch) {
        const current = Number(processingMatch[1]) || 0;
        const total = Number(processingMatch[2]) || 0;
        return {
            stage: 'transcribe',
            videoProgress: 0,
            videoCurrentSec: current,
            videoTotalSec: total,
            detail: total > 0 ? `片段 ${current}/${total}` : '识别中…',
        };
    }
    if (/正在处理（/.test(text)) {
        return { stage: 'transcribe', videoProgress: 0, detail: '识别中…' };
    }

    const durationMatch = text.match(/时长：\s*(.+?)\s*→\s*(.+?)(?:（|$)/);
    if (durationMatch) {
        const mediaTotalSec = parseChineseDurationSeconds(durationMatch[1].trim());
        const speechTotalSec = parseChineseDurationSeconds(durationMatch[2].trim());
        if (mediaTotalSec > 0) {
            parseState.mediaTotalSec = mediaTotalSec;
        }
        if (speechTotalSec > 0) {
            parseState.speechTotalSec = speechTotalSec;
        }
        if (mediaTotalSec > 0) {
            const detail = speechTotalSec > 0
                ? `视频 ${formatMediaTime(mediaTotalSec)} · 有效语音 ${formatMediaTime(speechTotalSec)}`
                : `视频时长 ${formatMediaTime(mediaTotalSec)}`;
            return {
                videoProgress: 0,
                videoCurrentSec: 0,
                videoTotalSec: mediaTotalSec,
                detail,
                mediaTotalSec,
                speechTotalSec,
            };
        }
    }

    const simpleDurationMatch = text.match(/^时长：\s*(.+)$/);
    if (simpleDurationMatch && !text.includes('→')) {
        const mediaTotalSec = parseChineseDurationSeconds(simpleDurationMatch[1].trim());
        if (mediaTotalSec > 0) {
            parseState.mediaTotalSec = mediaTotalSec;
            parseState.speechTotalSec = mediaTotalSec;
            return {
                videoProgress: 0,
                videoCurrentSec: 0,
                videoTotalSec: mediaTotalSec,
                detail: `视频时长 ${formatMediaTime(mediaTotalSec)}`,
                mediaTotalSec,
                speechTotalSec: mediaTotalSec,
            };
        }
    }

    const segMatch = text.match(/\[\d+:\d+(?:\.\d+)?\s*-->\s*(\d+):([\d.]+)\]/);
    const timelineTotalSec = parseState.mediaTotalSec || parseState.speechTotalSec;
    if (segMatch && timelineTotalSec > 0) {
        const endSec = parseLrcTimestampSeconds(segMatch[1], segMatch[2]);
        const ratio = Math.min(1, endSec / timelineTotalSec);
        const videoProgress = Math.min(100, Math.round(ratio * 100));
        const detail = `${formatMediaTime(endSec)} / ${formatMediaTime(timelineTotalSec)}`;
        return {
            stage: 'transcribe',
            videoProgress,
            videoCurrentSec: endSec,
            videoTotalSec: timelineTotalSec,
            detail,
        };
    }

    if (
        /正在写入：/.test(text)
        || /(?:^|\s)已保存(?:\s|$|[：:])/.test(text)
        || /\bsaved\b/i.test(text)
        || /完成处理/.test(text)
    ) {
        const total = parseState.mediaTotalSec || parseState.speechTotalSec || 0;
        return {
            stage: 'save',
            videoProgress: total > 0 ? 99 : 0,
            videoCurrentSec: total,
            videoTotalSec: total,
            detail: '保存字幕…',
        };
    }

    return null;
}


module.exports = {
    parseChineseDurationSeconds,
    formatMediaTime,
    parseInferTimestampMinutesSeconds,
    parseLrcTimestampSeconds,
    mapInferStageProgress,
    TRANSCRIBE_WALL_FACTOR,
    SYNTHETIC_PROGRESS_INTERVAL_MS,
    INFER_STAGE_RANK,
    inferStageRank,
    buildSyntheticTranscribeUpdate,
    mapPipelinePercent,
    parseInferProgressLine,
};
