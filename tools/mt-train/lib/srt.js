'use strict';

const fs = require('fs');

function textLen(t) {
    return [...String(t || '').replace(/\s/g, '')].length;
}

function parseSrt(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    return raw
        .trim()
        .split(/\r?\n\r?\n+/)
        .map((block) => {
            const lines = block.split(/\r?\n/);
            const i = lines.findIndex((l) => /-->/.test(l));
            if (i < 0) return null;
            const m = lines[i].match(
                /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/,
            );
            if (!m) return null;
            const toMs = (h, mi, s, ms) => ((+h) * 3600 + (+mi) * 60 + (+s)) * 1000 + (+ms);
            return {
                start: toMs(m[1], m[2], m[3], m[4]),
                end: toMs(m[5], m[6], m[7], m[8]),
                time: lines[i],
                text: lines.slice(i + 1).join(' ').trim(),
            };
        })
        .filter(Boolean);
}

/**
 * Nearest-start greedy alignment; each ZH cue used at most once.
 * Unmatched JA within window are omitted (legacy behavior).
 */
function alignCuesGreedy(ja, zh, tolMs = 1200) {
    const used = new Set();
    const pairs = [];
    for (let i = 0; i < ja.length; i += 1) {
        let best = -1;
        let bestD = Infinity;
        for (let j = 0; j < zh.length; j += 1) {
            if (used.has(j)) continue;
            const d = Math.abs(ja[i].start - zh[j].start);
            if (d < bestD) {
                bestD = d;
                best = j;
            }
        }
        if (best >= 0 && bestD <= tolMs) {
            used.add(best);
            pairs.push({
                ji: i + 1,
                zi: best + 1,
                d: bestD,
                src: ja[i].text,
                dst: zh[best].text,
                start: ja[i].start,
                time: ja[i].time,
                alignGap: false,
            });
        } else if (best < 0 || bestD > tolMs) {
            pairs.push({
                ji: i + 1,
                zi: null,
                d: bestD === Infinity ? null : bestD,
                src: ja[i].text,
                dst: '',
                start: ja[i].start,
                time: ja[i].time,
                alignGap: true,
            });
        }
    }
    return pairs;
}

/**
 * Needleman–Wunsch-style time alignment with JA/ZH gaps.
 * Match cost = |Δt|; gap cost = tolMs (prefer match when within window).
 * Emits alignGap:true for JA with no ZH partner (do not train as under).
 */
function alignCuesDp(ja, zh, tolMs = 1200) {
    const n = ja.length;
    const m = zh.length;
    if (!n) return [];
    if (!m) {
        return ja.map((c, i) => ({
            ji: i + 1,
            zi: null,
            d: null,
            src: c.text,
            dst: '',
            start: c.start,
            time: c.time,
            alignGap: true,
        }));
    }

    const GAP = tolMs;
    const INF = 1e18;
    // dp[i][j] cost for ja[0..i), zh[0..j)
    const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(INF));
    const bt = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 0 match 1 gapJA 2 gapZH
    dp[0][0] = 0;
    for (let i = 1; i <= n; i += 1) {
        dp[i][0] = i * GAP;
        bt[i][0] = 1;
    }
    for (let j = 1; j <= m; j += 1) {
        dp[0][j] = j * GAP;
        bt[0][j] = 2;
    }

    for (let i = 1; i <= n; i += 1) {
        for (let j = 1; j <= m; j += 1) {
            const d = Math.abs(ja[i - 1].start - zh[j - 1].start);
            const matchCost = d <= tolMs * 2 ? d : INF / 4;
            const viaMatch = dp[i - 1][j - 1] + matchCost;
            const viaGapJa = dp[i - 1][j] + GAP;
            const viaGapZh = dp[i][j - 1] + GAP;
            let best = viaMatch;
            let which = 0;
            if (viaGapJa < best) {
                best = viaGapJa;
                which = 1;
            }
            if (viaGapZh < best) {
                best = viaGapZh;
                which = 2;
            }
            dp[i][j] = best;
            bt[i][j] = which;
        }
    }

    const pairs = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
        const which = bt[i][j];
        if (i > 0 && j > 0 && which === 0) {
            const d = Math.abs(ja[i - 1].start - zh[j - 1].start);
            pairs.push({
                ji: i,
                zi: j,
                d,
                src: ja[i - 1].text,
                dst: zh[j - 1].text,
                start: ja[i - 1].start,
                time: ja[i - 1].time,
                alignGap: d > tolMs,
            });
            i -= 1;
            j -= 1;
        } else if (i > 0 && (j === 0 || which === 1)) {
            pairs.push({
                ji: i,
                zi: null,
                d: null,
                src: ja[i - 1].text,
                dst: '',
                start: ja[i - 1].start,
                time: ja[i - 1].time,
                alignGap: true,
            });
            i -= 1;
        } else if (j > 0) {
            j -= 1;
        } else {
            break;
        }
    }
    pairs.reverse();
    return pairs;
}

/**
 * Align JA/ZH cues by start time.
 * @param {Array<{start:number,text:string,time?:string}>} ja
 * @param {Array<{start:number,text:string}>} zh
 * @param {number} [tolMs=1200]
 * @param {{ mode?: 'greedy'|'dp', includeGaps?: boolean }} [opts]
 */
function alignCues(ja, zh, tolMs = 1200, opts = {}) {
    const mode = opts.mode || (opts.includeGaps ? 'dp' : 'greedy');
    if (mode === 'dp') {
        const pairs = alignCuesDp(ja, zh, tolMs);
        if (opts.includeGaps === false) {
            return pairs.filter((p) => !p.alignGap);
        }
        return pairs;
    }
    const pairs = alignCuesGreedy(ja, zh, tolMs);
    if (opts.includeGaps === false) {
        return pairs.filter((p) => !p.alignGap);
    }
    // Default greedy historically omitted gaps; keep that unless includeGaps
    if (!opts.includeGaps) {
        return pairs.filter((p) => !p.alignGap);
    }
    return pairs;
}

function extractTitleCode(name = '') {
    const m = String(name).match(/([A-Z]{2,6}-\d{2,4})/i);
    return m ? m[1].toUpperCase() : null;
}

function listSrtFiles(dir) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    const walk = (d) => {
        for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
            const p = require('path').join(d, ent.name);
            if (ent.isDirectory()) walk(p);
            else if (/\.srt$/i.test(ent.name)) {
                const st = fs.statSync(p);
                out.push({
                    path: p,
                    name: ent.name,
                    mtime: st.mtimeMs,
                    code: extractTitleCode(ent.name),
                });
            }
        }
    };
    walk(dir);
    return out;
}

module.exports = {
    textLen,
    parseSrt,
    alignCues,
    alignCuesGreedy,
    alignCuesDp,
    extractTitleCode,
    listSrtFiles,
};
