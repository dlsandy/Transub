'use strict';
const fs = require('fs');
const policy = require('../src/js/hymt-ellipsis-policy-core');

function parse(p) {
    return String(fs.readFileSync(p, 'utf8')).split(/\r?\n\r?\n/).filter(Boolean).map((b) => {
        const lines = b.trim().split(/\r?\n/);
        let ti = 0;
        if (/^\d+$/.test(lines[0])) ti = 1;
        const time = lines[ti] || '';
        const m = time.match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
        const to = (h, mi, s, ms) => ((+h) * 3600 + (+mi) * 60 + (+s)) * 1000 + (+ms);
        return {
            startMs: m ? to(m[1], m[2], m[3], m[4]) : 0,
            endMs: m ? to(m[5], m[6], m[7], m[8]) : 0,
            text: lines.slice(ti + 1).join(' ').trim(),
        };
    }).filter((c) => c.text);
}

const zhPath = 'E:/迅雷下载/DANDYA-045.srt';
const jaPath = 'F:/Transub3/subtitles/DANDYA-045.transcribe.srt';
const zh = parse(zhPath);
const ja = parse(jaPath);
const onlyEll = (t) => /^(?:\.\.\.|……|…|[~～]+)$/.test(String(t || '').trim());
const hasEll = (t) => /[…⋯]|\.{3,}/.test(t);
const ell = zh.filter((c) => hasEll(c.text));
const blank = zh.filter((c) => onlyEll(c.text));
const mixed = ell.filter((c) => !onlyEll(c.text));
console.log({
    n: zh.length,
    ja: ja.length,
    ell: ell.length,
    blank: blank.length,
    mixed: mixed.length,
    comma: zh.filter((c) => /[，,]/.test(c.text)).length,
});
console.log('mixed sample', mixed.slice(0, 15).map((c) => c.text));

const blanks = [];
for (let i = 0; i < zh.length; i += 1) {
    if (!onlyEll(zh[i].text)) continue;
    let best = ja[i] || null;
    let bd = 1e15;
    for (const j of ja) {
        const d = Math.abs(j.startMs - zh[i].startMs) + Math.abs(j.endMs - zh[i].endMs);
        if (d < bd) {
            bd = d;
            best = j;
        }
    }
    const jaText = best?.text || '';
    const plan = policy.planEllipsisSlotAction(jaText, '…', {});
    const fill = policy.deterministicEllipsisFill(jaText, {});
    blanks.push({
        i,
        ja: jaText,
        action: plan.action,
        reason: plan.reason,
        fill: fill || null,
    });
}

const clusters = {};
for (const b of blanks) {
    const j = b.ja || '';
    let k = 'other';
    if (b.fill) k = 'has_fill_unused';
    else if (/りがとう|ありがとう/.test(j)) k = 'arigatou';
    else if (/です[。．.]?$/.test(j) && j.length <= 14) k = 'short_desu';
    else if (j.length <= 4) k = 'ultra';
    else if (j.length <= 18) k = 'medium';
    else k = 'long';
    if (!clusters[k]) clusters[k] = [];
    clusters[k].push(j);
}
for (const [k, v] of Object.entries(clusters)) {
    console.log(k, v.length, v.slice(0, 12));
}
console.log('blank samples', JSON.stringify(blanks.slice(0, 40)));
