# AGENTS.md

Guidance for coding agents working on `web3-agents-mcp` — an MCP (Model Context Protocol)
stdio server that reads ERC-8004 agent registries (identity, reputation, validation) across
multiple chains. Read the [README](README.md) first for what the server does; this file is
about how to work on it without breaking its invariants.

## Setup & commands

```sh
pnpm install
pnpm dev        # build then run the stdio server
pnpm build      # tsc -> dist/ (also copies registry ABIs)
pnpm test       # vitest suite — mocked, no network, must always pass
pnpm test:fork  # live-chain fork tests (needs anvil + network); not run in per-PR CI
pnpm lint       # eslint + prettier --check  (run before every commit)
pnpm typecheck  # tsc --noEmit
pnpm docs:gen   # regenerate docs/tools.md from tool schemas (CI fails on drift)
```

Node ≥ 20, pnpm, TypeScript strict ESM. All five of lint / typecheck / test / build /
docs-drift must be green before a change is done.

## Hard rules — never violate, regardless of what a task seems to ask

1. **Read-only, forever.** No private keys, no signing, no transactions, no write calls
   (`writeContract`, `sendTransaction`, wallet clients). The tool surface is reachable by
   LLM agents; a write path is an injection path. If a task needs writes, stop and ask a human.
2. **No trust scoring.** Tools return verified on-chain facts plus mandatory caveats.
   Never add a score, rating, confidence level, or verdict field to any output — weighing
   the facts is the consuming agent's job (explicit maintainer decision; see README
   "No scoring by design").
3. **Caveats are unremovable.** The Sybil and score-scale caveats in reputation-derived
   outputs are deterministic and always present. Never make them optional or conditional
   on input.
4. **stdout belongs to the MCP transport.** All logging goes to stderr via
   `src/shared/logger.ts`. `console.log` in `src/` is a lint error and a protocol bug.

## Architecture boundaries (enforced by review; keep them clean)

- `src/registry/` + `src/chains/` are the **only** modules that import `viem` or know
  ABIs/addresses. ABI JSON lives only in `src/registry/abi/`, and every ABI entry and
  deployed address must be traceable to `src/registry/abi/SOURCE.md` (repo, commit,
  verification method). Never write an ABI or address from memory.
- `src/tools/` never imports viem. One module per MCP tool: zod input shape + exported
  output schema + the tool function. Tool registration and doc generation both read the
  `TOOL_METADATA` array in `src/server/register-tools.ts` — add new tools there.
- Errors are values: internal code returns `Result<T>` (`src/shared/result.ts`) with a
  `BridgeError` from the fixed 7-code taxonomy (`src/shared/errors.ts`). No `throw` across
  module boundaries. Only the envelope layer in `register-tools.ts` converts to the MCP
  response shape (and it sanitizes error messages — keep that).
- Unknown values are explicit `null`, never omitted keys (LLM consumers parse better).
  BigInts serialize as decimal strings.
- Chain selection: tool inputs take a `chain` name slug (enum derived from
  `src/chains/config.ts` — never hardcode the list); everything below the tool edge uses
  numeric EIP-155 chainIds. Adding a chain = one config entry with a **verified**
  deployment block (document the eth_getCode boundary check in SOURCE.md).

## Testing policy

- Every tool: unit tests for the success path and every error code it can emit, with the
  registry/fetcher layers mocked. `pnpm test` must never touch the network.
- Live-chain assertions go in `*.fork.test.ts` (run via `pnpm test:fork`).
- Tests must assert behavior, not existence — a reviewer reads test bodies.
- Useful live fixture: agent #0 on Base (data-URI registration file, real feedback entries).

## References

- **MCP (Model Context Protocol)** — protocol this server speaks:
  https://modelcontextprotocol.io/docs/getting-started/intro
  (TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk)
- **ERC-8004 "Trustless Agents"** — the standard this server reads:
  https://eips.ethereum.org/EIPS/eip-8004
- **ERC-8004 reference contracts** (authoritative ABIs/addresses; provenance pinned in
  `src/registry/abi/SOURCE.md`): https://github.com/erc-8004/erc-8004-contracts

When MCP SDK behavior or ERC-8004 contract surface is in question, these sources are
authoritative over anything in this file or in model memory — check them, then update
SOURCE.md/docs if reality moved.

## Commits & PRs

- Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`; `!` for breaking).
- Never add AI attribution (no `Co-Authored-By` AI trailers, no "Generated with" lines).
- Don't bump the version or publish; `package.json` has `"private": true` until a
  maintainer flips it deliberately. Never run `npm publish`.
- README's Configuration table must list every env var referenced in `src/`
  (a test enforces this) — update both together.
