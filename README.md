# web3-agents-mcp

An MCP (Model Context Protocol) server for on-chain AI agents: it discovers, inspects, and
verifies blockchain-registered agents over stdio, for any MCP-speaking client. Every tool takes
a `chainId` argument, so a single server instance works across every supported chain.

Concretely, it bridges [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) agent identity,
reputation, and validation registries — plus each agent's off-chain registration file — into
MCP tool calls. ERC-8004, in one line: it is an Ethereum standard for on-chain agent identity,
reputation, and validation registries, so agents built by different teams on different stacks
can discover and check facts about each other without a central directory.

## Read-only by design

This server never holds a private key, never signs a transaction, and exposes no write
operation of any kind — every tool is a read against public on-chain state or public off-chain
metadata. This is a deliberate boundary, not a missing feature: an MCP tool surface reachable by
an LLM agent must never have an injection path into on-chain actions (spending funds, changing
registrations, submitting feedback). If a task needs a write, it needs a different, explicitly
authorized tool — not this one.

## No scoring by design

`assess_trust` — the composite tool — returns `{identity, registrationFile, reputation,
validations, caveats, summary, missing}`. There is no numeric score, no confidence level, no
star rating anywhere in this server's output. It hands back verified on-chain facts plus
mandatory honesty caveats about those facts (see [Verification semantics](#verification-semantics)
and [Feedback honesty](#feedback-honesty) below); weighing those facts into an actual trust
decision — how much to rely on this agent, for this task, right now — is the consuming agent's
job, not this server's. A server that quietly compresses "57 feedback entries, all from one
address, no independent validation" into a single number is making a judgment call it has no
business making on the consumer's behalf.

## Quickstart

```sh
npx web3-agents-mcp
```

Pre-publish (before the npm release ships), run from a checkout instead:

```sh
pnpm install
pnpm build
node dist/server/index.js
```

The server speaks MCP over stdio; it does not open a network port.

## Client config

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

**Generic stdio client:** spawn `npx web3-agents-mcp` (or `node dist/server/index.js` from a
checkout) as a child process and speak MCP over its stdin/stdout.

## Tool reference

Seven tools: `ping`, `resolve_agent`, `get_registration_file`, `get_reputation`,
`get_validations`, `assess_trust`, `search_agents`. Full input/output schemas, defaults, and
possible error codes for each are generated from source into
[`docs/tools.md`](docs/tools.md) — regenerate it with `pnpm docs:gen` after changing a tool's
zod schema or description. A real captured call-by-call transcript is in
[`docs/demo.md`](docs/demo.md).

## Configuration

All configuration is via environment variables; every tool call still takes an explicit
`chainId` argument, so these are defaults, not global switches.

| Variable            | Default                                                                    | Purpose                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_CHAIN_ID`  | `8453` (Base)                                                              | Chain id used by any tool call that omits `chainId`.                                                                                                              |
| `RPC_URL_<chainId>` | none (built-in public RPC list per chain)                                  | Overrides/prepends the RPC endpoint used for that specific chain id, e.g. `RPC_URL_8453`.                                                                         |
| `CACHE_DIR`         | `~/.cache/web3-agents-mcp`                                                 | Directory for the local sqlite cache of fetched registration files.                                                                                               |
| `IPFS_GATEWAYS`     | `https://ipfs.io,https://cloudflare-ipfs.com,https://gateway.pinata.cloud` | Comma-separated list of IPFS HTTP gateways to try, in order, for `ipfs://` registration files.                                                                    |
| `LOG_LEVEL`         | `info`                                                                     | One of `error`, `warn`, `info`, `debug`; controls stderr log verbosity.                                                                                           |
| `INDEX_BACKEND`     | `null`                                                                     | Selects the `search_agents` backend. Only `null` (the MVP stub, always `INDEX_UNAVAILABLE`) is implemented; a real local-index backend ships in a future release. |

## Verification semantics

A registration file's `verified` field means different things depending on how the agent's
`tokenUri` points at it (see the v1 ERC-8004 contracts this server targets):

| `tokenUri` scheme | `verified` value  | Why                                                                                                                                                                                                                                            |
| ----------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data:` URI       | `true`            | The content is embedded directly in the on-chain `tokenUri`; there is nothing to fetch or spoof.                                                                                                                                               |
| `ipfs://`         | `true` or `false` | The file is fetched from an IPFS gateway and its content hash is checked against the CID in the URI — an explicit `false` means that check failed.                                                                                             |
| `https://`        | `null`            | Unverifiable: v1 has no on-chain hash commitment for `https://`-hosted files, so this server cannot confirm the fetched bytes are what the agent actually committed to. `null` is a distinct, deliberate value — never conflated with `false`. |

## Feedback honesty

`get_reputation` and `assess_trust` always attach caveats to feedback-derived data, because
on-chain feedback has real, structural weaknesses that no aggregation can paper over:

- There is no canonical score scale enforced by the registry; averages are clamped to 0-100
  and may overstate quality relative to whatever scale a given client actually used.
- Feedback is submitted by arbitrary addresses and is Sybil-able — nothing stops one party from
  submitting many entries under different addresses.

These caveats are deterministic and unremovable: they are always present in the output, not an
opt-in flag.

## Development

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

## License

MIT — see [LICENSE](LICENSE).
