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
| 导出   | `{ name?, version?, features?, getInfo?, helpers?, contextReconstruct(payload)?, filmContextReconstruct(payload)?, bilingualSemanticReview(payload)?, smartTranslate(payload)? }` |
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
| 体验包 | **9.9 元 / 7 天**（MVP）：密钥带 `expiresAt`；本地持续校验，到期回免费；**不可抵扣买断**；每爱发电账号限购 1 次（Worker） |


## Pro 体验包 MVP（客户端已支持）

- 本地许可状态持久化 `expiresAt`；`evaluateEntitlement` 在到期后返回 `reason: 'expired'`（不依赖 30 天复核窗口）
- 有 `expiresAt` 的许可在设置页显示为体验与剩余时间；买断仍为无过期时间
- 爱发电商品与「账号限 1 次」发货逻辑在 **私有 Worker**，见下方清单


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
| 购买页   | [爱发电 · Transub](https://afdian.com/a/transub)（大版本内买断 + **9.9 体验包**商品）                                                      |
| 应用入口  | 设置 → **Pro** →「在爱发电购买 Pro」；关于窗口亦可打开                                                                              |
| 推荐激活  | 付款后复制订单号 → 设置 → Pro → **领取并激活**（查单校验后签发并本机绑定）                                                                    |
| 备用激活  | 粘贴 `TSUB1.…` 密钥 → **激活**（兑换码池 / 人工发货仍可用）                                                                         |
| 覆盖范围  | 买断：本主版本内 Pro；体验包：签发后 **7 天**全功能，到期回免费（不可抵扣买断）                                                                       |
| 自动发货  | Cloudflare Worker（私有部署，不在本仓库）；Webhook + `/redeem`；KV 按订单幂等 |
| 设备硬限制 | Worker KV `lic:<licenseId>`：**同时 1 台**；换机冷却 30 天；激活/换机/复核/清除许可均联网同步；开发解锁跳过服务端                                    |
| 许可复核  | 联网复核走 Worker `/license/revalidate`（校验本机仍在绑定列表）                                                                   |


生产领取基址：`https://pay.kimtem.net`（Webhook：`/webhook/afdian`）。Worker 源码与 Secrets 仅本机 / Cloudflare Secret，勿提交公开仓库。

### Worker：体验包对齐清单（私有仓）

1. 爱发电 **9.9 元 Pro 体验包** `plan_id`：`e400fe8a907c11f1ad8252540025c377`（Worker `[vars].TRIAL_PLAN_IDS`）
2. 体验订单签发 `expiresAt = now + 7d`（`/redeem` / Webhook 首次签发时刻），`features: ['*']`
3. KV 限购：`trial:user:<afdian_user_id>` → 已发过则 `trial_already_used`（订单幂等仍保留）
4. `/redeem` 返回 `sku` / `expiresAt`；买断仍 `expiresAt: null`（`PRO_PLAN_IDS` + `MIN_AMOUNT`）
5. **不做**试用抵扣（二期）
6. 部署：`cd services/afdian-fulfillment && npm run deploy`


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

1. **影片简要**：按设置取样全片字幕，**优先依据原字幕**归纳梗概 / 人物 / 专名 / 语气（无原字幕时才用译文；预览可改人物与专名）
   - 默认「自适应抽样」（本地模型约最多 56 条，省显存）；设置 → 语境和理解重构 → **影片简要取样** 可选「全文理解」送入全部字幕
2. **场景分块**：时间间隙为主，辅以时长上限 / 称呼切换软切；硬拆重叠区不覆盖前块定稿
3. **上一场尾句只读**：减轻跨场断裂；缺条时降窗 / 补写重试
4. **一致性校对**：本地专名统一 + 变更条轻量 LLM 校对
5. **防合并错位**：改写后检测邻条并入 / 顺移；重试失败则回退疑似条目（严重则整块回退）；对照表标注「已回退原文」
6. **限流**：加强档与本地小模型自动缩小场景块、降低温度；入口提示原字幕覆盖率，须确认 Brief 后再改写

入口：编辑器「影片理解重构」、工作流步骤 `text.filmContextReconstruct`。

## 智能翻译（Pro 专属）

1. 选择 **智能翻译（LLM）**（任务为「翻译」或「双语」时可用；需 Pro）
2. 管线（默认）：**专训句级（Sakura/GalTransl，引擎分批）→ 整片译完后一次剧情贴合润色（对话模型，语意不变，抽样高风险行）→ 本地人名统一**
   润色与混合均可关。关掉混合或非日语时，对话模型按行翻译。默认不做旧式整句一致性大改。句级窗口约 8 条。
3. 模型：句级用推理翻译模型；润色用智能翻译 / BYOK 对话模型

免费用户请使用 **推理翻译**（Sakura 等）或引擎 Opus。语境重构、影片理解重构、影视音频增强仍全部需 Pro。

## 影视音频增强（Pro）

1. 勾选 **影视音频增强（Pro）**
2. 引擎在 ASR 前运行 **Demucs 人声分离**，再按电影预设提高 VAD 阈值
3. 引擎侧需安装 Demucs（设置 → 环境 → Transub Engine）


| 能力                     | 层级                        |
| ---------------------- | ------------------------- |
| 默认 VAD + 专家阈值/时长       | 免费                        |
| 推理翻译（Sakura 等专训模型） | 免费                        |
| 忠实语气                   | 免费                        |
| 智能翻译                   | **Pro**（专训句级 + 剧情贴合润色；均可关） |
| 影视音频增强（Pro）            | Demucs + 电影级 VAD          |
| 语境 / 影片理解重构（Pro）       | 需 `_advanced` + 许可        |


许可说明见根目录 [LICENSE](../LICENSE)、[LICENSE-PRO](../LICENSE-PRO)、[NOTICE](../NOTICE)。发布前可跑 `npm run check:release`（**不要**在未剥离专有源码前 `git push`）。
