# mcp-8004-bridge

An MCP (Model Context Protocol) server that bridges ERC-8004 agent registries and their
off-chain metadata to MCP-speaking clients over stdio.

Status: pre-alpha, read-only by design.

## Development

```sh
pnpm install
pnpm dev        # build then run the stdio server
pnpm build      # compile TypeScript to dist/
pnpm test       # run the vitest suite
pnpm lint       # eslint + prettier --check
pnpm typecheck  # tsc --noEmit
```
