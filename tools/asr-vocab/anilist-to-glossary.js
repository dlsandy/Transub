#!/usr/bin/env node
'use strict';

/**
 * Fetch AniList character names → Transub glossary JSON (+ optional engine asrGlossary).
 */
const path = require('path');
const fs = require('fs');
const { fetchAnilistGlossary } = require('./lib/anilist-fetch');
const {
    glossaryToEngineAsr,
    glossaryToHotwordsText,
    mergeGlossaryDocs,
    writeJson,
    parseArgs,
} = require('./lib/glossary-io');

const ROOT = path.join(__dirname, '..', '..');

function defaultOutPath(title, id) {
    const safe = String(title).replace(/[^\w\u3040-\u30ff\u4e00-\u9fff-]+/g, '-').slice(0, 48);
    return path.join(ROOT, 'tmp', 'asr-vocab', `${safe || `anilist-${id}`}.glossary.json`);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const id = args.id || args._[0];
    if (!id) {
        console.error('用法: anilist-to-glossary.js --id=<AniList媒体ID> [--type=ANIME|MANGA] [--out=path] [--merge=path] [--also-engine=path] [--also-hotwords=path]');
        process.exit(1);
    }

    const type = String(args.type || 'ANIME').toUpperCase();
    const result = await fetchAnilistGlossary(id, type);
    let glossary = result.glossary;

    if (args.merge) {
        const mergePath = path.resolve(String(args.merge));
        if (fs.existsSync(mergePath)) {
            glossary = mergeGlossaryDocs(JSON.parse(fs.readFileSync(mergePath, 'utf8')), glossary);
        }
    }

    const outPath = path.resolve(args.out || defaultOutPath(result.title, id));
    writeJson(outPath, glossary);

    console.log(`# AniList → 术语表`);
    console.log(`作品: ${result.title} (id=${result.mediaId})`);
    console.log(`条目: ${glossary.entries.length}`);
    console.log(`输出: ${outPath}`);
    console.log('导入: 字幕编辑器 → 术语表 → 导入 JSON');

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

main().catch((err) => {
    console.error(err.message || String(err));
    process.exit(1);
});
