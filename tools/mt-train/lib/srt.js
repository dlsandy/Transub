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
 * Nearest-start alignment; each ZH cue used at most once.
 * @param {Array<{start:number,text:string}>} ja
 * @param {Array<{start:number,text:string}>} zh
 * @param {number} [tolMs=1200]
 */
function alignCues(ja, zh, tolMs = 1200) {
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
            });
        }
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
    extractTitleCode,
    listSrtFiles,
};
