#!/usr/bin/env node
'use strict';

const path = require('path');
const { buildBadPoolGlossary } = require('./lib/bad-pool-glossary');
const { mergeGlossaryDocs, writeJson, parseArgs } = require('./lib/glossary-io');

const ROOT = path.join(__dirname, '..', '..');

function main() {
    const args = parseArgs(process.argv.slice(2));
    const root = args.root || '';
    const built = buildBadPoolGlossary(root || undefined);
    let glossary = built.glossary;

    if (args.merge) {
        const mergePath = path.resolve(String(args.merge));
        const fs = require('fs');
        if (fs.existsSync(mergePath)) {
            glossary = mergeGlossaryDocs(JSON.parse(fs.readFileSync(mergePath, 'utf8')), glossary);
        }
    }

    const outPath = path.resolve(
        args.out || path.join(ROOT, 'tmp', 'asr-vocab', 'bad-pool.glossary.json'),
    );
    writeJson(outPath, glossary);

    console.log(`# 坏句池 → 术语表`);
    console.log(`目录: ${built.dir}`);
    console.log(`卡片: ${built.cardCount}`);
    console.log(`条目: ${glossary.entries.length}`);
    console.log(`输出: ${outPath}`);
}

main();
