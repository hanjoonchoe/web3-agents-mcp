<!-- GENERATED FILE — do not edit by hand. Run `pnpm docs:gen` to regenerate. -->
# Tool reference

Generated from each tool's zod input/output schemas and description (`src/server/register-tools.ts`) by `scripts/gen-tool-docs.ts`.

## `ping`

Liveness check; returns pong and the server version.

**Input**

_No input fields._

**Output (sketch)**

```
{ pong: true; version: string }
```

**Possible error codes**

_Never returns an error envelope._

## `resolve_agent`

Resolves an ERC-8004 agent by agentId or ownerAddress (exactly one selector), returning identity fields plus best-effort endpoints/capabilities parsed from its registration file.

**Input**

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `chain` | `"ethereum" | "optimism" | "bnb" | "gnosis" | "polygon" | "base" | "arbitrum"` | no | — |
| `agentId` | `string` | no | — |
| `ownerAddress` | `string` | no | — |

**Output (sketch)**

```
{ chain: string; chainId: number; agentId: string | null; owner: string | null; tokenUri: string | null; registrationFileUrl: string | null; endpoints: string[] | null; capabilities: string[] | null; registeredAt: string | null; candidates: string[] }
```

**Possible error codes**

- `INVALID_INPUT`
- `CHAIN_UNSUPPORTED`
- `AGENT_NOT_FOUND`
- `RPC_ERROR`

## `get_registration_file`

Fetches and verifies an agent's registration file (via its tokenUri): ipfs:// CIDs are verified, data: URIs are inherently verified, https:// is unverifiable in v1 (no on-chain hash commitment).

**Input**

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `chain` | `"ethereum" | "optimism" | "bnb" | "gnosis" | "polygon" | "base" | "arbitrum"` | no | — |
| `agentId` | `string` | yes | — |
| `requireVerified` | `boolean` | no | — |

**Output (sketch)**

```
{ verified: boolean | null; hashComputed: string; source: "ipfs" | "https" | "data" | "cache"; fetchedAt: string; content: unknown; contentError: "not-json" | null; notes: string[] }
```

**Possible error codes**

- `INVALID_INPUT`
- `CHAIN_UNSUPPORTED`
- `AGENT_NOT_FOUND`
- `RPC_ERROR`
- `FILE_UNREACHABLE`
- `FILE_HASH_MISMATCH`

## `get_reputation`

Reads an agent's Reputation Registry feedback summary (and optionally the raw feedback entries). Always returns honesty caveats — feedback is self-reported by clients and is a weak signal, especially for low feedback counts.

**Input**

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `chain` | `"ethereum" | "optimism" | "bnb" | "gnosis" | "polygon" | "base" | "arbitrum"` | no | — |
| `agentId` | `string` | yes | — |
| `includeRaw` | `boolean` | no | false |
| `limit` | `number` | no | 50 |
| `offset` | `number` | no | 0 |

**Output (sketch)**

```
{ summary: object; raw: object[]; pagination: object; caveats: string[] }
```

**Possible error codes**

- `INVALID_INPUT`
- `CHAIN_UNSUPPORTED`
- `AGENT_NOT_FOUND`
- `RPC_ERROR`

## `get_validations`

Reads an agent's Validation Registry entries (validator, best-effort method classification, response, timestamp). An agent with zero validations is a normal, successful result — not an error.

**Input**

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `chain` | `"ethereum" | "optimism" | "bnb" | "gnosis" | "polygon" | "base" | "arbitrum"` | no | — |
| `agentId` | `string` | yes | — |
| `limit` | `number` | no | 50 |
| `offset` | `number` | no | 0 |

**Output (sketch)**

```
{ entries: object[]; count: string; pagination: object }
```

**Possible error codes**

- `INVALID_INPUT`
- `CHAIN_UNSUPPORTED`
- `AGENT_NOT_FOUND`
- `RPC_ERROR`

## `assess_trust`

Factual trust report for an ERC-8004 agent: runs identity, registration file, reputation, and validation lookups in parallel with graceful partial failure, and returns the raw sections plus deterministic honesty caveats and a short factual natural-language summary. No numeric scoring. `taskContext` only shapes the summary text.

**Input**

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `chain` | `"ethereum" | "optimism" | "bnb" | "gnosis" | "polygon" | "base" | "arbitrum"` | no | — |
| `agentId` | `string` | yes | — |
| `taskContext` | `string` | no | — |

**Output (sketch)**

```
{ identity: object | null; registrationFile: object | null; reputation: object | null; validations: object | null; caveats: string[]; summary: string; missing: "identity" | "registrationFile" | "reputation" | "validations"[] }
```

**Possible error codes**

- `INVALID_INPUT`
- `CHAIN_UNSUPPORTED`
- `AGENT_NOT_FOUND`
- `RPC_ERROR`

## `search_agents`

Searches for ERC-8004 agents by name/capability/description. MVP stub: no local index backend ships yet, so this always returns INDEX_UNAVAILABLE (input validation still runs first).

**Input**

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `chain` | `"ethereum" | "optimism" | "bnb" | "gnosis" | "polygon" | "base" | "arbitrum"` | no | — |
| `query` | `string` | yes | — |
| `limit` | `number` | no | 20 |

**Output (sketch)**

```
{ backend: string; results: object[]; indexFreshBlock: string | null; indexFreshAt: string | null }
```

**Possible error codes**

- `INVALID_INPUT`
- `INDEX_UNAVAILABLE`

## `list_chains`

Lists the chains this server is configured for. Every other tool's `chain` argument must be one of the `chain` slugs returned here; `isDefault` marks the chain used when a tool call omits `chain` (DEFAULT_CHAIN_ID env resolution).

**Input**

_No input fields._

**Output (sketch)**

```
{ chains: object[]; defaultChainId: number }
```

**Possible error codes**

_Never returns an error envelope._
