# ASR 坏句池（训练用）

真实误听卡片 → 可复用域纠错。卡片放本地 `tmp/asr-bad-pool/`（git 忽略）；本目录只保留 schema 与示例。

## 流程

1. 从编辑器 / 诊断包 / 二意见采纳窗抄一条坏句，按 `schema.json` 写入 `tmp/asr-bad-pool/YYYY-MM.jsonl`（每行一个 JSON）。
   - 二意见**自动草稿**也会追加到 `tmp/asr-bad-pool/YYYY-MM.second-opinion.jsonl`（需人工确认；可用选项 `asrBadPoolDrafts: false` 关闭）。
2. **同类模式 ≥2 部作品** 才写规则；单片专名标 `needs_second_title`，不进 SSOT。
3. 落库：
   - 普通 → `shared/ja-asr-domain-fixes.json`
   - 成人 → `src/js/mt-opaque-strings.js`（`getAsrAdultDomainPairs`）
4. 全量 `npx vitest run tests/mt-sanitize.test.js`（D01 变再跑 `tests/tdp-pack.test.js`）→ `npm run encode:tdp` → `npm run report:mt-conflicts`。
5. 查看待确认草稿：`npm run asr:bad-pool-summary`（或 `node tools/asr-bad-pool/summarize-jsonl.js`）。

## 禁令

- 禁止用 `title` / 番号门控运行时行为。
- 禁止把成人 JA/ZH 明文写进 tracked 源码（除 opaque `d()`）。
- 禁止为过一条夹具删除旧守卫；优先收紧前置条件。
