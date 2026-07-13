# ABI / address provenance

## Source repository

- Repo: https://github.com/erc-8004/erc-8004-contracts
- Release tag used: **none exists** — as of the retrieval date below the repository has
  no Git tags and no GitHub Releases (`gh api repos/erc-8004/erc-8004-contracts/releases`
  and `.../tags` both return empty lists). The audited v1 contracts are therefore pinned
  to the `master` branch HEAD commit below.
- Commit hash: `68fc6765761a10fb26f0692df21c8a6f9d12b1be`
  (`Merge pull request #83 from Wilbert957/feat/add-0g-mainnet`)
- Retrieval date: 2026-07-13
- Retrieval method: `git clone https://github.com/erc-8004/erc-8004-contracts.git`
  (shallow clone, `--depth 50`, HEAD = commit above)

## ABI extraction

The repo ships pre-built ABIs at `abis/IdentityRegistry.json`, `abis/ReputationRegistry.json`,
`abis/ValidationRegistry.json` (full contract ABIs, including OZ upgradeability/ownable
boilerplate). `src/registry/abi/*.json` in this project are **minimal read-surface
subsets** extracted from those files — only the ABI fragments this work package (or
documented future read-only work) actually needs:

- `identity.json`: `ownerOf`, `tokenURI` (functions used by `src/registry/identity.ts`);
  `Transfer`, `Registered` events (used for owner-enumeration and registration-time
  log-scans, see below); `ERC721NonexistentToken` error (required so viem can decode
  the revert reason for a nonexistent `agentId` into a named error — without this ABI
  entry the revert cannot be classified and would fall through to a generic RPC error).
- `reputation.json`: read-only (`view`/`pure`) functions only —
  `getIdentityRegistry`, `getClients`, `getLastIndex`, `getResponseCount`, `getSummary`,
  `getVersion`, `readAllFeedback`, `readFeedback`. Write functions (`giveFeedback`,
  `revokeFeedback`, `appendResponse`) and upgradeability/ownership boilerplate are
  excluded — out of scope per R-8 (no reputation.ts read module in this WP; ABI only,
  for WP-4 to consume).
- `validation.json`: read-only functions only — `getAgentValidations`,
  `getIdentityRegistry`, `getSummary`, `getValidationStatus`, `getValidatorRequests`,
  `getVersion`. Write functions (`validationRequest`, `validationResponse`) excluded,
  same rationale as above.

## Deployed addresses

All three registries are deployed via CREATE2 through a vanity-salt factory, so **the
same address is used across every mainnet chain** (and a different, but likewise
shared, address across every testnet). Source: `scripts/addresses.ts` (`MAINNET_ADDRESSES`)
and `README.md` in the contracts repo, cross-checked against on-chain `eth_getCode` on
both chains below.

| Registry           | Address                                      |
| ------------------ | -------------------------------------------- |
| IdentityRegistry   | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| ValidationRegistry | `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58` |

### Per-chain table (chains implemented in `src/chains/config.ts`)

| Chain            | chainId | IdentityRegistry (verify)                                                            | deploymentBlock | How `deploymentBlock` was derived                                                                                                                                                                                                       |
| ---------------- | ------- | ------------------------------------------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ethereum Mainnet | 1       | [etherscan](https://etherscan.io/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) | `24339871`      | Binary search over `eth_getCode` at increasing block numbers against a public archive RPC (`https://eth.drpc.org`) until code first appears. Verified: block `24339870` → `0x` (no code), block `24339871` → deployed bytecode present. |
| Base Mainnet     | 8453    | [basescan](https://basescan.org/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)  | `41663783`      | Same binary-search method against `https://mainnet.base.org`. Verified: block `41663782` → `0x`, block `41663783` → deployed bytecode present.                                                                                          |

No official "deployments" manifest with block numbers is published in the contracts
repo (only addresses), so `deploymentBlock` was derived empirically as documented above
rather than invented. This is the value `getAgentsByOwner`'s log-scan uses as
`fromBlock`, so an off-by-one in the conservative direction (as low as possible) is
safe; both directions were explicitly verified with `eth_getCode` at the boundary.

## Domain resolution (`resolveByDomain`)

The audited v1 `IdentityRegistryUpgradeable` contract has **no on-chain domain
registry or resolution function**. `ownerOf`/`tokenURI` are the only identity reads;
domain names only appear as an **optional off-chain field** (`domains: []`) inside the
agent's registration file JSON referenced by `agentURI`/`tokenURI` (see
`ERC8004SPEC.md`, agent registration file schema, and the "Endpoint Domain
Verification" section — an off-chain `.well-known` HTTPS proof, not an on-chain
lookup). There is no ENS-style reverse mapping and no `resolveByDomain`-shaped
function anywhere in the ABI.

Consequently `src/registry/identity.ts`'s `resolveByDomain` always returns `null` — it
does not invent a mechanism. If a future contract version adds on-chain domain
resolution, this function and this note must be updated together.

## Enumeration (`getAgentsByOwner`)

The Identity Registry is a plain `ERC721URIStorage` — it does **not** implement
`ERC721Enumerable` (no `tokenOfOwnerByIndex`, no `totalSupply` in the ABI).
`getAgentsByOwner` therefore reconstructs current ownership via a `Transfer` event
log-scan constrained to `[deploymentBlock, latest]`, rather than a contract
enumeration call. See the code comment in `src/registry/identity.ts` for the exact
algorithm (net current holder is derived by comparing the latest `to`-matching vs.
`from`-matching `Transfer` log per `tokenId`).

## Registration timestamp (`getAgent().registeredAt`)

There is no `registeredAt`/`registeredAtBlock` getter on the contract. `Registered` is
emitted once per agent with `agentId` indexed, so `registeredAt` is resolved via a
best-effort `Registered`-event log-scan (constrained to `[deploymentBlock, latest]`)
followed by an `eth_getBlockByNumber` for the block timestamp. If the log-scan or block
fetch fails for any reason (pruned logs, RPC limitation, etc.) `registeredAt` is `null`
rather than failing the whole `getAgent` read — see Deviations in the WP-2 completion
report.
