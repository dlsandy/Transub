'use strict';

const { textLen } = require('./srt');

/** High-confidence residual classifiers (post-sanitize). */
function classifyIssues(src, dst, after) {
    const issues = [];
    const s = String(src || '');
    const a = String(after || '');

    // Avoid ダイッ false-positive (イッ inside ダイッ)
    if (
        /(?:イッちゃ|イッた|イッて|イキ|イク|いく|イき|いけろ|いくぞ|はいくぞ)/.test(s)
        && /要去了|快去了|又去了/.test(a)
        && !/出して|出され|射精|出ちゃう|出すぞ|出してやる|ザーメン|精液|出しちゃ/.test(s)
    ) {
        issues.push('iku_shoot');
    }
    if (
        /出ちゃ|でちゃ/.test(s)
        && (/要出来了|又要出来了/.test(a) || (/出来了/.test(a) && !/射出来|要射|射了/.test(a)))
        && !/あばあ|おじい|外に出ちゃ|外に出[るて]|出て行|出かけ/.test(s)
        && !/爷爷/.test(a)
    ) {
        issues.push('dechau_out');
    }
    if (/(?:やめ|りゃめ|ヤメ|らめらめ)/.test(s) && /要射|射了|射出来/.test(a) && !/出して|射精/.test(s)) {
        issues.push('yame_shoot');
    }
    if (/翻译成中文|请勿删除|移至对应|术语表|译名表|只输出译文/.test(a)) {
        issues.push('prompt_leak');
    }
    if (
        /[A-Za-z]{3,}/.test(a)
        && !/[A-Za-z]{3,}/.test(s)
        && !/OK|DVD|AV|NG|YouTube|Good|Satoshi/i.test(a)
    ) {
        issues.push('latin');
    }
    if (/阴茎|生殖器/.test(a) && !/おちん|ちん|ペニス|肉棒|竿|チン/.test(s)) {
        issues.push('invent_rod');
    }
    if (/おちん|ちんぽ|ちんちん|デカチン/.test(s) && /阴茎|生殖器|大尺寸|小鸡鸡|那东西/.test(a)) {
        issues.push('clinical_rod');
    }
    if (/嘿咻/.test(a) && !/ヘイス|えっち|エッチ|ヤッ|やっ|SEX|セックス/.test(s)) {
        issues.push('heixiu');
    }
    if (
        /気持ちいい|きもちいい|きもちぃ/.test(s)
        && /^(?:好热|感觉好|好厉害|(?:哈啊?|哈…)+|嗯)[…。．.!！?\s]*$/u.test(a.trim())
    ) {
        issues.push('kimochi_stub');
    }
    if (
        textLen(a) <= 3
        && textLen(s) >= 10
        && /舐めて|入れて|おちん|フェラ|中出し|キス|お願い|触って|吸って|初めて/.test(s)
    ) {
        issues.push('under_stub');
    }
    if (/(?:いく|イク)(?:[…・.\s、,]*(?:いく|イク))+/.test(s) && /行了/.test(a) && !/不行/.test(a)) {
        issues.push('iku_xing');
    }
    if (/気に入っちゃ|気にいっちゃ/.test(s) && /进去了|进入了/.test(a)) {
        issues.push('kiniri');
    }
    if (/シオ|ちゅば|じゅぶ|ぢゅぱ|ごぼ|ごくっ/.test(s) && /初音|吸吧|湿哦|Juventus|把头靠/.test(a)) {
        issues.push('sfx_halluc');
    }
    if (/[\u3040-\u30ff]{4,}/.test(a) && !/[\u4e00-\u9fff]/.test(a)) {
        issues.push('ja_echo');
    }

    // Alignment suspect: short JA vs long ZH (often condensed human ZH mis-pair)
    if (
        textLen(s) <= 4
        && textLen(a) >= 10
        && /^[ぁ-んァ-ン…・っッ!！?？はぁあっんむぐ\s]+$/u.test(s)
    ) {
        issues.push('align_suspect');
    }

    return issues;
}

const CLUSTER_ORDER = [
    'prompt_leak',
    'iku_shoot',
    'dechau_out',
    'yame_shoot',
    'iku_xing',
    'kiniri',
    'kimochi_stub',
    'clinical_rod',
    'invent_rod',
    'sfx_halluc',
    'latin',
    'heixiu',
    'under_stub',
    'ja_echo',
    'moan_expand',
    'align_suspect',
    'align_gap',
    'asr_garbage',
];

/** fixed:* clusters sort after live residuals */
function clusterSortKey(name) {
    if (String(name).startsWith('fixed:')) {
        return 1000 + CLUSTER_ORDER.indexOf(name.slice(6));
    }
    const i = CLUSTER_ORDER.indexOf(name);
    return i >= 0 ? i : 500;
}

function clusterHits(hits, { maxPerCluster = 40 } = {}) {
    const map = new Map();
    for (const hit of hits) {
        const keys = hit.issues && hit.issues.length ? hit.issues : ['other'];
        for (const key of keys) {
            if (!map.has(key)) map.set(key, []);
            const arr = map.get(key);
            if (arr.length < maxPerCluster) arr.push(hit);
        }
    }
    const clusters = [...map.entries()]
        .map(([cluster, samples]) => ({ cluster, n: samples.length, samples }))
        .sort((a, b) => clusterSortKey(a.cluster) - clusterSortKey(b.cluster) || b.n - a.n);
    return clusters;
}

module.exports = {
    classifyIssues,
    clusterHits,
    CLUSTER_ORDER,
};
