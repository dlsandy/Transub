# Contributing（公开仓库）

本文面向 **GitHub 公开仓** 的贡献者与维护者。完整架构说明、Agent 规则与发版手测清单仅保留在维护者本机（`docs/`、`.cursor/rules/`、`AGENTS.md`），不随公开仓发布。

## 环境

- **Node.js** ≥ 22.12（见 `package.json` `engines`）
- Windows 10 / 11（产品与发行目标平台）
- 首次：`npm install`、`npm run setup:ffmpeg`；引擎独立版置于 `transub-engine/`（含 `runtime\python.exe`）

## 提交前检查

```bash
npm run check:proprietary    # Pro 闭源路径 / 本地专用路径不得被 git 跟踪
npm run check:agent-rules    # 规则与 AGENTS.md 一致性（本机有 docs/ 时做全文交叉检查）
npm run smoke:preflight      # renderer 构建、packaging、release、关键 core 测试
```

发版前另需维护者本机 `docs/smoke-checklist.md` 手测（不在公开仓）。

## 公开仓边界

**禁止** `git add` / commit / push 以下内容（清单见 `tools/proprietary-paths.js` → `NEVER_GIT_TRACK`）：

| 类别 | 示例 |
|------|------|
| Pro 算法与闭源包 | `electron/advanced-smart-translate.js`、`_advanced/`、闭源测试 |
| 密钥与私有服务 | `.advanced-license-private.b64`、`services/` |
| 本地文档与规则 | `docs/`、`AGENTS.md`、`.cursor/` |
| 临时与草稿 | `tmp/`、`tools/tmp-*`、`tools/_tmp-*`、`tests/fixtures/mt-train-drafts/` |

新增 Pro 算法文件时：同步更新 `.gitignore`、`tools/proprietary-paths.js`、`package.json` `build.files` 排除项、`tools/verify-packaging.js` / `tools/build-renderer.js`，并 `npm run check:proprietary`。

**MIT Core（可公开）**：门控、公钥验签、BYOK UI、托管模型目录等 — 见 `NOTICE`，不要误当作闭源删除。

## 代码结构（摘要）

- 可测逻辑：`src/js/*-core.js`（UMD + `module.exports`）
- 壳层接线：`src/js/app.js`、`subtitle-editor.js`、`electron/*-bridge.js` — 避免继续堆业务逻辑
- Pro 算法：本地 `npm run build:advanced` → `_advanced/index.js`（发行包旁路，不进 asar 源码）

## 许可

- 开源部分：[MIT](LICENSE)
- Pro 模块：[LICENSE-PRO](LICENSE-PRO)
- 第三方：见 [NOTICE](NOTICE)

## 反馈

- [GitHub Issues](https://github.com/dlsandy/Transub/issues)
- 发行包用户：软件内「使用反馈」
