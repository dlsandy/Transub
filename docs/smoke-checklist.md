# 发版前冒烟清单

发版或合并大块壳层改动前，先跑自动化预检，再按本清单手测关键路径（尤其是近期 fail-closed / 抽取过的接线）。

## 自动化（必跑）

```bash
npm run smoke:preflight
```

等价于：`build:renderer` → `verify:packaging` → `check:release` → 抽取 core 相关 Vitest。

也可分步：

```bash
npm run build:renderer
npm run verify:packaging
npm run check:release
npx vitest run tests/final-round-cores.test.js tests/sense-finalize-core.test.js
```

## 手测（主窗口）

| # | 场景 | 期望 |
|---|------|------|
| 1 | 智能感知开 → 拖入文件 → 感知完成后点「开始」 | 未采纳项会自动采纳或阻断；不应在缺 core 时静默放行 |
| 2 | 设置改选项 → 保存 → 重启主窗口 | 选项回显正确；保存失败（core 缺失）应有明确错误，不写空 `{}` |
| 3 | 批次完成且开启观影后处理 | 后处理执行；若 `post-batch-autofix-plan` 缺失，日志报错并跳过（不静默当「无需跑」） |
| 4 | 重新翻译若干项 | 总进度条随项前进，不卡在 0% |
| 5 | 旧存档：无 `postBatchCompactPureInterjections` / 观影 mode 字段 | 不因缺字段突然大量删语气条；清除档仍按 UI 生效 |
| 6 | 设置 → 运行环境 | 仅 Transub Engine / llama-server；无「兼容后端 / TWAI」入口 |
| 6b | 冷启动向导（未 Pro）选「更准」并勾选托管对话模型 | 写入后**不要**勾选智能翻译；有 Sakura 则走推理翻译；日志/应用行可提示解锁 Pro 后可用 |

## 手测（字幕库）

| # | 场景 | 期望 |
|---|------|------|
| 6c | 工具栏「字幕库」 / 设置 → 字幕库 → 打开 | 打开 `subtitle-library` 窗口；日常/专业切换正常；试看播放器可切版本 |
| 6d | 免费用户点字幕库 A/B、diff、发布等 Pro 深度能力 | 提示需解锁 Pro，不崩溃 |

## 手测（字幕编辑器）

| # | 场景 | 期望 |
|---|------|------|
| 7 | 选区局部重转写 → 写回 | 成功时 cue 正确 splice；计划失败时不假成功（可回退 `replaceCuesInTimeRange`） |
| 8 | 静音切分 / 智能时长（任选） | 预览与应用正常；控制台无 `missing TransubEditorParts` 告警 |
| 8b | 智能翻译（日语，混合默认开） | 进度出现「句级改用」Sakura/GalTransl；各批译完后出现一次「剧情贴合润色」与修订条数（非整批反复润色）；关掉混合或非日语时走对话模型行对齐 |
| 8c | 编辑器「智能翻译」按钮 / 右键 | 跟随设置的混合与贴合润色；结果对照 lead 可见「专训句级 / 贴合润色 N」；进度可见润色阶段 |

## 打包抽检

| # | 场景 | 期望 |
|---|------|------|
| 9 | `npm run build:dir`（或已有 `dist/win-unpacked`） | asar/`resources` 含新增 `*-core.js` 与编辑器 parts（`verify:packaging` 已覆盖清单） |
| 10 | 解压后冷启动一次 | 日志无「关键界面核心未加载」；开始按钮可用 |

## 备注

- 本清单不替代 `tests/mt-sanitize.test.js` 全量；MT / TDP 训练后仍按仓库规则跑 sanitize + `encode:tdp`。
- 细节与模块所有权见 [architecture.md](./architecture.md)。
