<div align="center">

# web3-agents-mcp

### 发现、查询并验证链上 AI 代理 — 在任何 MCP 客户端中。

[English](README.md) | [日本語](README.ja.md) | **中文** | [한국어](README.ko.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](tsconfig.json)
[![MCP](https://img.shields.io/badge/protocol-MCP-8A2BE2)](https://modelcontextprotocol.io)
[![ERC-8004](https://img.shields.io/badge/standard-ERC--8004-627EEA)](https://eips.ethereum.org/EIPS/eip-8004)
[![Chains](https://img.shields.io/badge/chains-7-informational)](#%EF%B8%8F-支持的链)
[![Tests](https://img.shields.io/badge/tests-165%20passing-success)](test)

一个将 [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) 代理身份、声誉与验证注册表
桥接为任何 AI 代理都能调用的 MCP 工具的服务器。一个服务器，覆盖所有受支持的链 —
每个工具都接受 `chain` 参数。

</div>

---

## 📋 目录

- [为什么需要它](#-为什么需要它)
- [快速开始](#-快速开始)
- [提示词示例](#-提示词示例)
- [工具](#-工具)
- [设计原则](#%EF%B8%8F-设计原则)
- [支持的链](#%EF%B8%8F-支持的链)
- [配置](#%EF%B8%8F-配置)
- [验证语义](#-验证语义)
- [反馈的诚实性](#-反馈的诚实性)
- [开发](#%EF%B8%8F-开发)
- [路线图](#%EF%B8%8F-路线图)
- [许可证](#-许可证)

## 🤔 为什么需要它

AI 代理已经开始雇佣其他代理、向其付款并委派任务。ERC-8004（"Trustless Agents"）为它们
提供了链上信任层 — 部署在 20 多条 EVM 链上的身份、声誉与验证注册表 — 但在此之前，LLM
代理没有办法在自己的工具循环中读取这些数据。

**web3-agents-mcp 填补了这一空白。** 在你的代理信任对方之前，它可以先问：这个代理归谁
所有？它的注册文件是真实的吗？它收到过哪些反馈 — 来自谁？有没有人独立验证过它的工作？

## 🚀 快速开始

```sh
npx web3-agents-mcp
```

> npm 版本发布前，请从源码运行 — `pnpm install && pnpm build && node dist/server/index.js`

**Claude Code:**

```sh
claude mcp add web3-agents -- npx web3-agents-mcp
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "web3-agents": {
      "command": "npx",
      "args": ["web3-agents-mcp"]
    }
  }
}
```

**其他 MCP 客户端：** 将 `npx web3-agents-mcp` 作为子进程启动，通过 stdio 使用 MCP。
服务器不开放任何网络端口。

## 💬 提示词示例

连接后，直接向你的代理自然提问即可：

> _"web3-agents 服务器支持哪些链？"_
>
> _"查一下 Base 上的 ERC-8004 代理 #1 — 它归谁所有、是做什么的？"_
>
> _"代理 #42 的注册文件通过密码学验证了吗？"_
>
> _"把 Base 上代理 #1 收到的原始反馈连同提交者地址一起列出来。"_
>
> _"代码评审任务能信任 Polygon 上的代理 #0 吗？把链上事实拉出来看看。"_

## 🧰 工具

| 工具                    | 返回内容                                                                  |
| ----------------------- | ------------------------------------------------------------------------- |
| `list_chains`           | 已配置的链：slug、chainId、注册表地址、默认标记                           |
| `resolve_agent`         | 按 agentId 或所有者地址返回身份记录：所有者、tokenUri、端点、能力         |
| `get_registration_file` | 代理的**完整注册文件** — 获取并做哈希验证（`data:`/`ipfs://`/`https://`） |
| `get_reputation`        | 反馈摘要 + 可选的**逐客户端原始条目**（地址、分数、标签），分页           |
| `get_validations`       | 独立验证条目：验证者、方式（TEE/ZK/重执行）、结果                         |
| `assess_trust`          | **组合事实报告**：身份 + 文件验证 + 声誉 + 验证 + 注意事项 + 通俗摘要     |
| `search_agents`         | 能力搜索（索引器后端 — MVP 为桩实现）                                     |
| `ping`                  | 存活检测 + 版本                                                           |

每个工具的完整输入/输出模式、默认值与错误码由源码生成至
[`docs/tools.md`](docs/tools.md)（`pnpm docs:gen`）。真实调用记录见
[`docs/demo.md`](docs/demo.md)。

## 🛡️ 设计原则

> ### 🔒 只读设计
>
> 无私钥、无签名、无写操作 — 每个工具都只读取公开状态。LLM 可触达的 MCP 工具面绝不能存在
> 通向链上行为（转移资金、修改注册、提交反馈）的注入路径。需要写入的任务，需要的是另一个
> 被明确授权的工具 — 而不是这一个。

> ### ⚖️ 无评分设计
>
> 本服务器的任何输出中都没有数值评分、置信度或星级。它只交回**经过验证的链上事实加上
> 强制性注意事项**；将其权衡为信任决策是消费方代理的职责。一个悄悄把"57 条反馈、全部来自
> 同一地址、无独立验证"压缩成一个数字的服务器，是在替消费者做它无权做的判断。

## ⛓️ 支持的链

| 链               | `chain` 值 | chainId | 支持 |
| ---------------- | ---------- | ------- | ---- |
| Ethereum Mainnet | `ethereum` | 1       | ✅   |
| Base Mainnet     | `base`     | 8453    | ✅   |
| Polygon PoS      | `polygon`  | 137     | ✅   |
| Arbitrum One     | `arbitrum` | 42161   | ✅   |
| OP Mainnet       | `optimism` | 10      | ✅   |
| BNB Smart Chain  | `bnb`      | 56      | ✅   |
| Gnosis Chain     | `gnosis`   | 100     | ✅   |

注册表地址在所有链上完全相同（CREATE2）。添加新链只需在 `src/chains/config.ts` 增加一个
条目；代理可通过 `list_chains` 获取实时列表，每个工具模式中的 `chain` 枚举也会自动更新。

## ⚙️ 配置

所有配置均通过环境变量完成；每次工具调用仍接受显式 `chain` 参数，因此这些只是默认值而非
全局开关。

| 变量                | 默认值                                                                     | 用途                                                                               |
| ------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `DEFAULT_CHAIN_ID`  | `8453` (Base)                                                              | 省略 `chain` 的调用所使用的链 id。                                                 |
| `RPC_URL_<chainId>` | 无（每条链内置公开 RPC 列表）                                              | 覆盖/优先使用该链 id 的 RPC 端点，如 `RPC_URL_8453`。                              |
| `CACHE_DIR`         | `~/.cache/web3-agents-mcp`                                                 | 已获取注册文件的本地 sqlite 缓存目录。                                             |
| `IPFS_GATEWAYS`     | `https://ipfs.io,https://cloudflare-ipfs.com,https://gateway.pinata.cloud` | 针对 `ipfs://` 注册文件按序尝试的 IPFS HTTP 网关列表（逗号分隔）。                 |
| `LOG_LEVEL`         | `info`                                                                     | `error`、`warn`、`info`、`debug` 之一；控制 stderr 日志详细程度。                  |
| `INDEX_BACKEND`     | `null`                                                                     | 选择 `search_agents` 后端。目前仅实现 `null`（MVP 桩，始终 `INDEX_UNAVAILABLE`）。 |

## 🔍 验证语义

注册文件的 `verified` 字段的含义取决于代理的 `tokenUri` 指向文件的方式（基于本服务器
针对的 v1 ERC-8004 合约）：

| `tokenUri` 方案 | `verified` 值     | 原因                                                                                                                                        |
| --------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `data:` URI     | `true`            | 内容直接内嵌于链上 `tokenUri`，无需获取，也无从伪造。                                                                                       |
| `ipfs://`       | `true` 或 `false` | 从 IPFS 网关获取文件并将内容哈希与 URI 中的 CID 比对 — 显式 `false` 表示校验失败。                                                          |
| `https://`      | `null`            | 不可验证：v1 对 `https://` 托管文件没有链上哈希承诺，无法确认获取的字节就是代理实际承诺的内容。`null` 是刻意区分的值，绝不与 `false` 混淆。 |

## 🧂 反馈的诚实性

`get_reputation` 与 `assess_trust` 始终为反馈类数据附加注意事项，因为链上反馈存在任何
聚合都无法掩盖的结构性弱点：

- 注册表不强制任何标准评分刻度；平均值被钳制到 0-100，可能相对提交者实际使用的刻度高估质量。
- 反馈由任意地址提交，可被女巫（Sybil）攻击 — 没有机制阻止同一方用不同地址提交大量条目。

这些注意事项是确定性的且不可移除：始终出现在输出中，不是可选开关。

## 🛠️ 开发

```sh
pnpm install
pnpm dev        # 构建并运行 stdio 服务器
pnpm build      # 将 TypeScript 编译到 dist/
pnpm test       # 运行 vitest 测试套件（不含实链 fork 测试）
pnpm test:fork  # 针对公开 RPC 运行实链 fork 测试
pnpm lint       # eslint + prettier --check
pnpm typecheck  # tsc --noEmit
pnpm docs:gen   # 从工具模式重新生成 docs/tools.md
```

项目结构：

- `src/chains` — 每条链的静态配置（注册表地址、部署区块、RPC URL）。
- `src/registry` — 对 ERC-8004 身份/声誉/验证合约的类型化读取。
- `src/fetcher` — 注册文件获取、哈希/CID 验证与 sqlite 缓存。
- `src/trust` — `assess_trust` 的编排、确定性注意事项与摘要文本。
- `src/indexer` — `search_agents` 后端契约与 MVP `NullBackend` 桩。
- `src/tools` — 每个 MCP 工具一个模块：输入/输出 zod 模式加工具函数。
- `src/server` — MCP 服务器装配、工具注册与 stdio 入口。
- `src/shared` — 全局使用的 `Result`/`BridgeError` 类型与 stderr 日志器。

贡献者/代理指南见 [AGENTS.md](AGENTS.md)。

## 🗺️ 路线图

- [ ] **本地搜索索引器** — 真正的 `search_agents` 后端（SQLite 日志回填、可断点续传）
- [ ] **端点存活检测** — 标记所公布端点已失效的代理
- [ ] **Streamable HTTP 传输** — 托管/共享部署
- [ ] **npm 发布** — 无需检出即可 `npx web3-agents-mcp`
- [ ] 更多链（每条链一个配置条目）

## 📄 许可证

MIT — 见 [LICENSE](LICENSE)。
