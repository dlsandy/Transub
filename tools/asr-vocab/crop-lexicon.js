#!/usr/bin/env node
'use strict';

/**
 * Crop THUOCL / NEologd seed / plain term lists → Transub glossary or hotwords.txt.
 *
 * Usage:
 *   node tools/asr-vocab/crop-lexicon.js --in=THUOCL_IT.txt --format=thuocl --limit=120 --out=tmp/it.glossary.json
 *   node tools/asr-vocab/crop-lexicon.js --in=neologd-proper-noun.csv --format=neologd --limit=300 --ja-only
 *   node tools/asr-vocab/crop-lexicon.js --in=terms.txt --format=lines --also-hotwords=tmp/hot.txt
 */
const fs = require('fs');
const path = require('path');
const {
    lexiconLinesToGlossary,
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
        console.error([
            '用法: crop-lexicon.js --in=<file> [--format=thuocl|neologd|lines|hotword|auto]',
            '  [--limit=200] [--min-df=0] [--ja-only|--zh-only]',
            '  [--out=path] [--merge=path] [--also-engine=path] [--also-hotwords=path]',
        ].join('\n'));
        process.exit(1);
    }

    const lines = fs.readFileSync(inPath, 'utf8').split(/\r?\n/);
    let glossary = lexiconLinesToGlossary(lines, {
        format: args.format || 'auto',
        limit: args.limit || 200,
        minDf: args['min-df'] || args.minDf || 0,
        jaOnly: !!args['ja-only'],
        zhOnly: !!args['zh-only'],
        source: `lexicon:${path.basename(inPath)}`,
        note: `自 ${path.basename(inPath)} 裁剪`,
    });

    if (args.merge) {
        const mergePath = path.resolve(String(args.merge));
        if (fs.existsSync(mergePath)) {
            glossary = mergeGlossaryDocs(JSON.parse(fs.readFileSync(mergePath, 'utf8')), glossary);
        }
    }

    const stem = path.basename(inPath, path.extname(inPath));
    const outPath = path.resolve(
        args.out || path.join(ROOT, 'tmp', 'asr-vocab', `${stem}.glossary.json`),
    );
    writeJson(outPath, glossary);

    console.log(`# 词库裁剪 → 术语表`);
    console.log(`输入: ${inPath} (${lines.length} 行)`);
    console.log(`格式: ${args.format || 'auto'}`);
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
