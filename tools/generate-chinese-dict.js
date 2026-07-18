/**
 * 从 OpenCC 字符表生成 src/js/subtitle-chinese-dict.js
 *
 * 用法：
 *   node tools/generate-chinese-dict.js
 *
 * 字典文件默认读取 tools/tmp-opencc/ 下的 ST/TS Characters 与 Phrases
 * （可从 https://github.com/BYVoid/OpenCC 的 data/dictionary 下载）
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dictDir = path.join(root, 'tools', 'tmp-opencc');
const outFile = path.join(root, 'src', 'js', 'subtitle-chinese-dict.js');

function parseDict(file) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const map = new Map();
    for (const line of lines) {
        if (!line || line.startsWith('#')) continue;
        const tab = line.indexOf('\t');
        if (tab < 0) continue;
        const key = line.slice(0, tab);
        const vals = line.slice(tab + 1).trim().split(/\s+/).filter(Boolean);
        if (!key || !vals.length) continue;
        if (!map.has(key)) map.set(key, vals[0]);
    }
    return map;
}

function parsePhrases(file) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const pairs = [];
    for (const line of lines) {
        if (!line || line.startsWith('#')) continue;
        const tab = line.indexOf('\t');
        if (tab < 0) continue;
        const from = line.slice(0, tab);
        const vals = line.slice(tab + 1).trim().split(/\s+/).filter(Boolean);
        if (!from || !vals.length) continue;
        const to = vals[0];
        if (from === to) continue;
        if ([...from].length < 2) continue;
        pairs.push([from, to]);
    }
    pairs.sort((a, b) => b[0].length - a[0].length || a[0].localeCompare(b[0], 'zh-CN'));
    return pairs;
}

function toParallel(map) {
    let from = '';
    let to = '';
    for (const [k, v] of map) {
        if (k === v) continue;
        const kChars = [...k];
        const vChars = [...v];
        if (kChars.length !== 1 || vChars.length !== 1) continue;
        from += k;
        to += v;
    }
    return { from, to };
}

const stCharPath = path.join(dictDir, 'STCharacters.txt');
const tsCharPath = path.join(dictDir, 'TSCharacters.txt');
const stPhrasePath = path.join(dictDir, 'STPhrases.txt');
const tsPhrasePath = path.join(dictDir, 'TSPhrases.txt');

if (!fs.existsSync(stCharPath) || !fs.existsSync(tsCharPath)) {
    console.error('缺少字典文件，请将 OpenCC STCharacters.txt / TSCharacters.txt 放到 tools/tmp-opencc/');
    process.exit(1);
}
if (!fs.existsSync(stPhrasePath)) {
    console.error('缺少短语字典，请将 OpenCC STPhrases.txt 放到 tools/tmp-opencc/');
    process.exit(1);
}

const s2t = toParallel(parseDict(stCharPath));
const t2s = toParallel(parseDict(tsCharPath));
const s2tPhrases = parsePhrases(stPhrasePath);
let t2sPhrases = fs.existsSync(tsPhrasePath) ? parsePhrases(tsPhrasePath) : null;
if (!t2sPhrases) {
    const inverse = new Map();
    for (const [from, to] of s2tPhrases) {
        if (!inverse.has(to)) inverse.set(to, from);
    }
    t2sPhrases = [...inverse.entries()]
        .sort((a, b) => b[0].length - a[0].length || a[0].localeCompare(b[0], 'zh-CN'));
    console.warn('[generate-chinese-dict] 未找到 TSPhrases.txt，已从 STPhrases 反向生成 T2S 短语表');
}

const out = `/**
 * OpenCC 简繁字符/短语映射（由 tools/generate-chinese-dict.js 生成，请勿手改）
 * 数据来源：OpenCC ST/TS Characters & Phrases，Apache-2.0
 * https://github.com/BYVoid/OpenCC
 */
(function (global, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (global) {
        global.TransubSubtitleChineseDict = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function subtitleChineseDictFactory() {
    return {
        S2T_FROM: ${JSON.stringify(s2t.from)},
        S2T_TO: ${JSON.stringify(s2t.to)},
        T2S_FROM: ${JSON.stringify(t2s.from)},
        T2S_TO: ${JSON.stringify(t2s.to)},
        S2T_PHRASES: ${JSON.stringify(s2tPhrases)},
        T2S_PHRASES: ${JSON.stringify(t2sPhrases)},
    };
}));
`;

fs.writeFileSync(outFile, out);
console.log(`[generate-chinese-dict] S2T ${[...s2t.from].length} 字 / ${s2tPhrases.length} 短语, T2S ${[...t2s.from].length} 字 / ${t2sPhrases.length} 短语`);
console.log(`[generate-chinese-dict] 写入 ${path.relative(root, outFile)} (${fs.statSync(outFile).size} bytes)`);
