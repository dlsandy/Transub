# Transub Pro：模块边界与大版本内买断条款

## 开源边界（Core / MIT）

- 媒体导入、**Transub Engine**（默认转录/译中）、字幕编辑、规则后处理、工作流引擎
- Pro **插件契约**：许可状态 IPC、BYOK 配置、模块加载路径、工作流步骤挂载点
- 开源侧：`advanced-gates.js` / `advanced-bridge.js`（门控与 IPC）、`advanced-entitlement-core.js`、`advanced-license-crypto-core.js`、智能翻译 builtin 回退
- **不含**语境重构 / 影片理解重构 / 双语语义审阅的算法与提示词实现（见闭源模块）
- 引擎边界详见 [engine-boundary.md](./engine-boundary.md)
- 与引擎任务共用主进程 **单任务锁**（见 `compute-task-lock.js`）：主窗口批处理与编辑器 LLM/重转写互斥；批次内嵌套翻译可重入

## 闭源模块


| 项    | 约定                                                                                                                                                                                                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 查找路径 | `{安装目录}/_advanced/index.js` 或 `{可写目录}/advanced-modules/index.js`                                                                                                                                                                                                                   |
| 导出   | `{ name?, version?, features?, getInfo?, contextReconstruct(payload)?, filmContextReconstruct(payload)?, bilingualSemanticReview(payload)? }`                                                                                                                                      |
| 首发能力 | `contextReconstruct`、`filmContextReconstruct`、`smartTranslate`（智能翻译 Pro）、`filmAudioEnhance`（影视音频增强）、`bilingualSemanticReview`（可返回 `suggestedTarget` 供一键采纳）、`qcSmartFix`（QC 智能修复：断句 / 局部重转写 / 润色 / 可选语义审阅；主窗口可传 `pairPath`/`pairCues`；按内容画像调 CPS/清杂音/重转写强度；兼容 `contextReconstruct`） |
| 构建   | `npm run build:advanced` → 生成压缩后的 `_advanced/index.js`（gitignore，勿提交）                                                                                                                                                                                                              |
| 发行   | `electron-builder` `extraFiles` 将 `_advanced` 放到 exe 旁；**asar 不含**算法源码                                                                                                                                                                                                             |
| LLM  | 用户 BYOK；密钥经 `safeStorage` 加密保存在 `transub-advanced.json` 的 `byokKeyBlob`                                                                                                                                                                                                            |


未安装闭源模块时：

- **开发（未打包）**：回退仓库内置实现，便于调试
- **正式包**：对应 Pro 能力直接报错（`advanced_module_missing`），不再内置明文算法



## 大版本内买断默认参数（已实现策略常量）


| 项   | 值                                                                         |
| --- | ------------------------------------------------------------------------- |
| 设备  | 最多同时 **1** 台                                                              |
| 换机  | **每 30 天最多成功换机 1 次**                                                      |
| 离线  | 激活后可用；**每 30 天需联网复核**                                                     |
| LLM | 用户 BYOK 外接，或软件内选模型（下载 GGUF + 自带 llama-server）                             |
| 版本  | **大版本内买断**：含本主版本（如 3.x）内 Pro 功能集；下一主版本（如 4.0）需另行购买（产品文案；代码以 feature 列表为准） |




## 许可密钥

格式：`TSUB1.<payload_b64url>.<sig_b64url>`（Ed25519）

签发（私钥勿入库）：

```bash
# 将 PKCS8 DER base64 私钥写入 .advanced-license-private.b64（已 gitignore）
node tools/sign-advanced-license.js --id=lic_demo_001

# 批量生成爱发电兑换码（每行 licenseId<TAB>密钥）
node tools/sign-advanced-license.js --count=20 --prefix=pro2026 --out=keys.txt
```

开发解锁（仅未打包；正式包忽略该环境变量）：

```bash
set TRANSUB_ADVANCED_DEV_UNLOCK=1
```



## 购买与发货（爱发电）


| 项     | 说明                                                                                                               |
| ----- | ---------------------------------------------------------------------------------------------------------------- |
| 购买页   | [爱发电 · Transub](https://afdian.com/a/transub)（**大版本内买断**商品）                                                      |
| 应用入口  | 设置 → **Pro** →「在爱发电购买 Pro」；关于窗口亦可打开                                                                              |
| 推荐激活  | 付款后复制订单号 → 设置 → Pro → **领取并激活**（查单校验后签发并本机绑定）                                                                    |
| 备用激活  | 粘贴 `TSUB1.…` 密钥 → **激活**（兑换码池 / 人工发货仍可用）                                                                         |
| 覆盖范围  | 本主版本（如 3.x）内 Pro 功能；下一主版本需另行购买（以爱发电商品说明为准）                                                                       |
| 自动发货  | Cloudflare Worker：`[services/afdian-fulfillment/](../services/afdian-fulfillment/)`；Webhook + `/redeem`；KV 按订单幂等 |
| 设备硬限制 | Worker KV `lic:<licenseId>`：**同时 1 台**；换机冷却 30 天；激活/换机/复核/清除许可均联网同步；开发解锁跳过服务端                                    |
| 许可复核  | 联网复核走 Worker `/license/revalidate`（校验本机仍在绑定列表）                                                                   |


Worker 部署与 Secrets 见 `[services/afdian-fulfillment/README.md](../services/afdian-fulfillment/README.md)`。生产领取基址：`https://pay.kimtem.net`（Webhook：`/webhook/afdian`）。私钥仅放本机 / Worker Secret，勿提交仓库。

## 大模型双通道

设置 → **高级** → **大模型**：


| 来源             | 说明                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **外接模型（BYOK）** | 填写 Base URL / 模型 / API Key（云端或自建 OpenAI 兼容接口，含本机 Ollama）                                                                                         |
| **软件内选模型**     | 软件下载推荐 GGUF；**llama-server** 后端在设置 → **运行环境** 安装/切换（有 NVIDIA 且驱动 CUDA≥12 时默认 CUDA 12，否则 Vulkan）；模型目录与用途选用在设置 → Pro → 大模型；调用重构时自动启动本地 OpenAI 兼容服务 |


数据目录：`{可写根目录}/advanced-llm/`（`runtime/` + `models/`）。

## 语境重构（Pro）

正式包需 `_advanced`；开发态可用内置实现：

1. 开发运行 `npm start`：未打包时 **自动开发解锁** Pro
2. 设置 → **高级**：配置外接 BYOK 或软件内选模型，或勾选「模拟重构」
3. 编辑器 → 工作流 / 更多工具 → **语境重构（Pro）**

行为：按窗口分块（默认 30 条、重叠 2 条）→ Chat Completions → 按 index 回写译文。

## 影片理解重构（Pro）

1. **影片简要**：抽样全片，归纳梗概 / 人物 / 专名 / 语气
2. **场景分块**：按时间间隙切场，再注入 Brief 改写
3. **上一场尾句只读**：减轻跨场断裂

入口：编辑器「影片理解重构」、工作流步骤 `text.filmContextReconstruct`。

## 智能翻译（Pro 专属）

1. 选择 **智能翻译（LLM）**（任务为「翻译」或「双语」时可用；需 Pro）
2. 管线：**理解全文（影片简要）→ 分块翻译（简要 + 块间上下文）→ 一致性校对**
3. 模型：外接 BYOK，或软件内托管 GGUF（经 Pro 许可）

免费用户请使用 **推理翻译**（Sakura 等）或引擎 Opus。语境重构、影片理解重构、影视音频增强仍全部需 Pro。

## 影视音频增强（Pro）

1. 勾选 **影视音频增强（Pro）**
2. 引擎在 ASR 前运行 **Demucs 人声分离**，再按电影预设提高 VAD 阈值
3. 引擎侧需安装 Demucs（设置 → 环境 → Transub Engine）


| 能力                     | 层级                        |
| ---------------------- | ------------------------- |
| 默认 VAD + 专家阈值/时长       | 免费                        |
| 推理翻译（Sakura / 本地 GGUF） | 免费                        |
| 忠实语气                   | 免费                        |
| 智能翻译                   | **Pro**（影片简要 → 分块译 → 一致性） |
| 影视音频增强（Pro）            | Demucs + 电影级 VAD          |
| 语境 / 影片理解重构（Pro）       | 需 `_advanced` + 许可        |


许可说明见根目录 [LICENSE](../LICENSE)、[LICENSE-PRO](../LICENSE-PRO)、[NOTICE](../NOTICE)。发布前可跑 `npm run check:release`（**不要**在未剥离专有源码前 `git push`）。