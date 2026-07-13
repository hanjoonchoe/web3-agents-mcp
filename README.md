<div align="center">

# web3-agents-mcp

### Discover, inspect, and verify on-chain AI agents — from any MCP client.

**English** | [日本語](README.ja.md) | [中文](README.zh.md) | [한국어](README.ko.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](tsconfig.json)
[![MCP](https://img.shields.io/badge/protocol-MCP-8A2BE2)](https://modelcontextprotocol.io)
[![ERC-8004](https://img.shields.io/badge/standard-ERC--8004-627EEA)](https://eips.ethereum.org/EIPS/eip-8004)
[![Chains](https://img.shields.io/badge/chains-7-informational)](#-supported-chains)
[![Tests](https://img.shields.io/badge/tests-165%20passing-success)](test)

An MCP (Model Context Protocol) server that bridges
[ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) agent identity, reputation, and
validation registries into tool calls any AI agent can make. One server, every supported
chain — each tool takes a `chain` argument.

</div>

---

## 📋 Table of contents

- [Why](#-why)
- [Quickstart](#-quickstart)
- [Example prompts](#-example-prompts)
- [Tools](#-tools)
- [Design principles](#-design-principles)
- [Supported chains](#-supported-chains)
- [Configuration](#-configuration)
- [Verification semantics](#-verification-semantics)
- [Feedback honesty](#-feedback-honesty)
- [Development](#-development)
- [Roadmap](#-roadmap)
- [License](#-license)

## 🤔 Why

AI agents are starting to hire, pay, and delegate to other agents. ERC-8004 ("Trustless
Agents") gives them an on-chain trust layer — identity, reputation, and validation
registries on 20+ EVM chains — but until now an LLM agent had no way to read it from
inside its tool loop.

**web3-agents-mcp closes that gap.** Before your agent trusts a counterparty, it can ask:
Who owns this agent? Is its registration file authentic? What feedback has it received —
and from whom? Has anyone independently validated its work?

## 🚀 Quickstart

```sh
npx web3-agents-mcp
```

> Pre-publish: run from a checkout instead — `pnpm install && pnpm build && node dist/server/index.js`

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

**Any other MCP client:** spawn `npx web3-agents-mcp` as a child process and speak MCP
over stdio. The server never opens a network port.

## 💬 Example prompts

Once connected, just ask your agent naturally:

> _"Which chains does the web3-agents server support?"_
>
> _"Look up ERC-8004 agent #1 on Base — who owns it and what does it do?"_
>
> _"Is agent #42's registration file cryptographically verified?"_
>
> _"Show me the raw feedback entries for agent #1 on Base, including who submitted them."_
>
> _"Should I trust agent #0 on Polygon for a code-review task? Pull the on-chain facts."_

## 🧰 Tools

| Tool                    | What it returns                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `list_chains`           | Configured chains: slug, chainId, registry addresses, default flag                                                       |
| `resolve_agent`         | Identity record by agentId or owner: owner, tokenUri, endpoints, capabilities                                            |
| `get_registration_file` | The agent's **full registration file**, fetched and hash-verified (`data:`/`ipfs://`/`https://`)                         |
| `get_reputation`        | Feedback summary + optional **raw per-client entries** (address, score, tag), paginated                                  |
| `get_validations`       | Independent validation entries: validator, method (TEE/ZK/re-execution), result                                          |
| `assess_trust`          | **Composite factual report**: identity + file verification + reputation + validations + caveats + plain-language summary |
| `search_agents`         | Capability search (indexer backend — MVP ships a stub)                                                                   |
| `ping`                  | Liveness + version                                                                                                       |

Full input/output schemas, defaults, and error codes are generated from source into
[`docs/tools.md`](docs/tools.md) (`pnpm docs:gen`). A real captured transcript is in
[`docs/demo.md`](docs/demo.md).

## 🛡️ Design principles

> ### 🔒 Read-only by design
>
> No private keys, no signing, no write operations — every tool reads public state. An MCP
> tool surface reachable by an LLM must never have an injection path into on-chain actions
> (spending funds, changing registrations, submitting feedback). If a task needs a write,
> it needs a different, explicitly authorized tool — not this one.

> ### ⚖️ No scoring by design
>
> There is no numeric score, confidence level, or star rating anywhere in this server's
> output. It hands back **verified on-chain facts plus mandatory honesty caveats**;
> weighing them into a trust decision is the consuming agent's job. A server that quietly
> compresses "57 feedback entries, all from one address, no independent validation" into a
> single number is making a judgment call it has no business making on the consumer's
> behalf.

## ⛓️ Supported chains

| Chain            | `chain` value | chainId | Supported |
| ---------------- | ------------- | ------- | --------- |
| Ethereum Mainnet | `ethereum`    | 1       | ✅        |
| Base Mainnet     | `base`        | 8453    | ✅        |
| Polygon PoS      | `polygon`     | 137     | ✅        |
| Arbitrum One     | `arbitrum`    | 42161   | ✅        |
| OP Mainnet       | `optimism`    | 10      | ✅        |
| BNB Smart Chain  | `bnb`         | 56      | ✅        |
| Gnosis Chain     | `gnosis`      | 100     | ✅        |

Registry addresses are identical on every chain (CREATE2). Adding a chain is one entry in
`src/chains/config.ts`; agents discover the live list via the `list_chains` tool, and the
`chain` enum in every tool's schema updates automatically.

## ⚙️ Configuration

All configuration is via environment variables; every tool call still takes an explicit
`chain` argument, so these are defaults, not global switches.

| Variable            | Default                                                                    | Purpose                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_CHAIN_ID`  | `8453` (Base)                                                              | Chain id used by any tool call that omits `chain`.                                                                                                                |
| `RPC_URL_<chainId>` | none (built-in public RPC list per chain)                                  | Overrides/prepends the RPC endpoint used for that specific chain id, e.g. `RPC_URL_8453`.                                                                         |
| `CACHE_DIR`         | `~/.cache/web3-agents-mcp`                                                 | Directory for the local sqlite cache of fetched registration files.                                                                                               |
| `IPFS_GATEWAYS`     | `https://ipfs.io,https://cloudflare-ipfs.com,https://gateway.pinata.cloud` | Comma-separated list of IPFS HTTP gateways to try, in order, for `ipfs://` registration files.                                                                    |
| `LOG_LEVEL`         | `info`                                                                     | One of `error`, `warn`, `info`, `debug`; controls stderr log verbosity.                                                                                           |
| `INDEX_BACKEND`     | `null`                                                                     | Selects the `search_agents` backend. Only `null` (the MVP stub, always `INDEX_UNAVAILABLE`) is implemented; a real local-index backend ships in a future release. |

## 🔍 Verification semantics

A registration file's `verified` field means different things depending on how the agent's
`tokenUri` points at it (per the v1 ERC-8004 contracts this server targets):

| `tokenUri` scheme | `verified` value  | Why                                                                                                                                                                                                                                            |
| ----------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data:` URI       | `true`            | The content is embedded directly in the on-chain `tokenUri`; there is nothing to fetch or spoof.                                                                                                                                               |
| `ipfs://`         | `true` or `false` | The file is fetched from an IPFS gateway and its content hash is checked against the CID in the URI — an explicit `false` means that check failed.                                                                                             |
| `https://`        | `null`            | Unverifiable: v1 has no on-chain hash commitment for `https://`-hosted files, so this server cannot confirm the fetched bytes are what the agent actually committed to. `null` is a distinct, deliberate value — never conflated with `false`. |

## 🧂 Feedback honesty

`get_reputation` and `assess_trust` always attach caveats to feedback-derived data, because
on-chain feedback has real, structural weaknesses that no aggregation can paper over:

- There is no canonical score scale enforced by the registry; averages are clamped to 0-100
  and may overstate quality relative to whatever scale a given client actually used.
- Feedback is submitted by arbitrary addresses and is Sybil-able — nothing stops one party
  from submitting many entries under different addresses.

These caveats are deterministic and unremovable: they are always present in the output, not
an opt-in flag.

## 🛠️ Development

```sh
pnpm install
pnpm dev        # build then run the stdio server
pnpm build      # compile TypeScript to dist/
pnpm test       # run the vitest suite (excludes live-chain fork tests)
pnpm test:fork  # run the live-chain fork tests against public RPCs
pnpm lint       # eslint + prettier --check
pnpm typecheck  # tsc --noEmit
pnpm docs:gen   # regenerate docs/tools.md from the tool schemas
```

Project layout:

- `src/chains` — per-chain static config (registry addresses, deployment blocks, RPC URLs).
- `src/registry` — typed reads against the identity/reputation/validation ERC-8004 contracts.
- `src/fetcher` — registration-file retrieval, hashing/CID verification, and the sqlite cache.
- `src/trust` — `assess_trust`'s orchestration, deterministic caveats, and summary text.
- `src/indexer` — `search_agents` backend contract and the MVP `NullBackend` stub.
- `src/tools` — one module per MCP tool: input/output zod schemas plus the tool function.
- `src/server` — MCP server wiring, tool registration, and the stdio entry point.
- `src/shared` — the `Result`/`BridgeError` types and the stderr logger used everywhere.

Contributor/agent guidelines live in [AGENTS.md](AGENTS.md).

## 🗺️ Roadmap

- [ ] **Local search indexer** — real `search_agents` backend (SQLite log backfill, resumable)
- [ ] **Endpoint liveness checks** — flag agents whose advertised endpoints are dead
- [ ] **Streamable HTTP transport** — hosted/shared deployments
- [ ] **npm release** — `npx web3-agents-mcp` without a checkout
- [ ] More chains (one config entry each)

## 📄 License

MIT — see [LICENSE](LICENSE).
