#!/usr/bin/env node
'use strict';

/**
 * Summarize local ASR bad-pool JSONL drafts (open cards).
 * Usage: node tools/asr-bad-pool/summarize-jsonl.js [--root=path]
 */
const path = require('path');
const { summarizeBadPoolJsonl } = require('../../electron/asr-bad-pool-draft');

function parseRoot(argv) {
    for (const arg of argv) {
        if (arg.startsWith('--root=')) return arg.slice('--root='.length);
    }
    return '';
}

const root = parseRoot(process.argv.slice(2));
const sum = summarizeBadPoolJsonl({ root: root || undefined, sampleLimit: 20 });

console.log(`# ASR 坏句池摘要`);
console.log(`目录: ${sum.dir}`);
console.log(`文件: ${sum.files.length ? sum.files.join(', ') : '（无）'}`);
console.log(`合计 ${sum.total} 条 · 待确认 ${sum.open} 条`);
if (Object.keys(sum.byKind).length) {
    console.log('按类型:', Object.entries(sum.byKind).map(([k, n]) => `${k}=${n}`).join(', '));
}
if (sum.samples.length) {
    console.log('\n## 待确认样例');
    for (const s of sum.samples) {
        console.log(`- [${s.kind}/${s.profile}] ${s.ja_wrong} → ${s.ja_right} (${s.file})`);
    }
}
