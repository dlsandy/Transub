#!/usr/bin/env node
'use strict';

/**
 * Convert asr-hotword / CapsWriter hot.txt → Transub glossary JSON.
 *
 * Format (per line):
 *   正确词 | 误听别名1 | 误听别名2 ~~~ 黑名单1 | 黑名单2
 *
 * Usage:
 *   node tools/asr-vocab/import-hotword.js --in=hot.txt --out=tmp/imported.glossary.json
 */
const fs = require('fs');
const path = require('path');
const {
    hotwordTextToGlossary,
    glossaryToEngineAsr,
    glossaryToHotwordsText,
    mergeGlossaryDocs,
    writeJson,
    parseArgs,
} = require('./lib/glossary-io');

const ROOT = path.join(__dirname, '..', '..');

function main() {
    const args = parseArgs(process.argv.slice(2));
    const inPath = path.resolve(args.in || args._[0] || '');
    if (!inPath || !fs.existsSync(inPath)) {
        console.error('用法: import-hotword.js --in=<hot.txt> [--out=path] [--merge=path] [--also-engine=path]');
        process.exit(1);
    }

    const text = fs.readFileSync(inPath, 'utf8');
    let glossary = hotwordTextToGlossary(text, {
        source: `hotword:${path.basename(inPath)}`,
        note: '自 asr-hotword 格式导入',
    });

    if (args.merge) {
        const mergePath = path.resolve(String(args.merge));
        if (fs.existsSync(mergePath)) {
            glossary = mergeGlossaryDocs(JSON.parse(fs.readFileSync(mergePath, 'utf8')), glossary);
        }
    }

    const outPath = path.resolve(
        args.out || path.join(ROOT, 'tmp', 'asr-vocab', `${path.basename(inPath, path.extname(inPath))}.glossary.json`),
    );
    writeJson(outPath, glossary);

    console.log(`# 热词文件 → 术语表`);
    console.log(`输入: ${inPath}`);
    console.log(`条目: ${glossary.entries.length}`);
    console.log(`输出: ${outPath}`);

    if (args['also-engine']) {
        const enginePath = path.resolve(String(args['also-engine']));
        const pairs = glossaryToEngineAsr(glossary);
        writeJson(enginePath, pairs);
        console.log(`引擎 asrGlossary: ${enginePath} (${pairs.length} 对)`);
    }
    if (args['also-hotwords']) {
        const hotPath = path.resolve(String(args['also-hotwords']));
        fs.mkdirSync(path.dirname(hotPath), { recursive: true });
        fs.writeFileSync(hotPath, glossaryToHotwordsText(glossary), 'utf8');
        console.log(`hotwords.txt: ${hotPath}`);
    }
}

main();
