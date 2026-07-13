import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Abi, Address, PublicClient } from "viem";
import { parseAbiItem } from "viem";
import { getChainConfig } from "../chains/config.js";
import { getPublicClient } from "../chains/clients.js";
import { bridgeError } from "../shared/errors.js";
import { type Result, err, isOk, ok } from "../shared/result.js";
import { classifyContractError, toRpcError } from "./errors.js";

// Loaded via readFileSync (not a JSON module import) so the compiled dist/ output
// doesn't depend on Node's ESM JSON import-attribute support — same pattern used by
// src/tools/ping.ts for package.json. `pnpm build` copies this directory into dist/.
function loadAbi(name: string): Abi {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(path.join(here, "abi", `${name}.json`), "utf8");
  return JSON.parse(raw) as Abi;
}

const identityAbi = loadAbi("identity");

// Typed directly (rather than pulled out of identityAbi) so getLogs' `args` filter and
// decoded `log.args` are fully typed instead of `unknown`. Signatures match the
// Registered/Transfer entries in identity.json (same source, see SOURCE.md).
const registeredEvent = parseAbiItem(
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
);
const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);

export type AgentRecord = {
  agentId: bigint;
  owner: Address;
  tokenUri: string;
  registeredAt: bigint | null;
};

function resolveClientAndConfig(
  chainId: number,
): Result<{ client: PublicClient; identity: Address; deploymentBlock: bigint }> {
  const clientResult = getPublicClient(chainId);
  if (!isOk(clientResult)) {
    return clientResult;
  }
  const config = getChainConfig(chainId);
  if (!config) {
    return err(bridgeError("CHAIN_UNSUPPORTED", `chainId ${chainId} is not supported`));
  }
  return ok({
    client: clientResult.value,
    identity: config.registries.identity,
    deploymentBlock: config.deploymentBlock,
  });
}

/**
 * Best-effort lookup of an agent's registration timestamp via a Registered-event
 * log-scan (agentId is indexed) followed by a block timestamp fetch. There is no
 * registeredAt getter on the contract (see SOURCE.md) — if the log-scan or block
 * fetch fails for any reason, this returns null rather than failing the caller's
 * getAgent read.
 */
async function findRegisteredAt(
  client: PublicClient,
  identity: Address,
  deploymentBlock: bigint,
  agentId: bigint,
): Promise<bigint | null> {
  try {
    const logs = await client.getLogs({
      address: identity,
      event: registeredEvent,
      args: { agentId },
      fromBlock: deploymentBlock,
      toBlock: "latest",
    });
    const first = logs[0];
    if (!first || first.blockNumber === null) {
      return null;
    }
    const block = await client.getBlock({ blockNumber: first.blockNumber });
    return block.timestamp;
  } catch {
    return null;
  }
}

export async function getAgent(chainId: number, agentId: bigint): Promise<Result<AgentRecord>> {
  const resolved = resolveClientAndConfig(chainId);
  if (!isOk(resolved)) {
    return resolved;
  }
  const { client, identity, deploymentBlock } = resolved.value;

  let owner: Address;
  let tokenUri: string;
  try {
    [owner, tokenUri] = await Promise.all([
      client.readContract({
        address: identity,
        abi: identityAbi,
        functionName: "ownerOf",
        args: [agentId],
      }) as Promise<Address>,
      client.readContract({
        address: identity,
        abi: identityAbi,
        functionName: "tokenURI",
        args: [agentId],
      }) as Promise<string>,
    ]);
  } catch (cause) {
    return err(classifyContractError(cause));
  }

  const registeredAt = await findRegisteredAt(client, identity, deploymentBlock, agentId);
  return ok({ agentId, owner, tokenUri, registeredAt });
}

/**
 * The v1 Identity Registry is a plain ERC721URIStorage — it does not implement
 * ERC721Enumerable (no tokenOfOwnerByIndex/totalSupply; see SOURCE.md). Ownership is
 * therefore reconstructed from a Transfer event log-scan constrained to
 * [deploymentBlock, latest]: for every tokenId that ever moved to or from `owner`, the
 * chronologically last matching Transfer log determines whether `owner` currently
 * holds it (a "to owner" log more recent than any "from owner" log for that tokenId).
 */
export async function getAgentsByOwner(chainId: number, owner: Address): Promise<Result<bigint[]>> {
  const resolved = resolveClientAndConfig(chainId);
  if (!isOk(resolved)) {
    return resolved;
  }
  const { client, identity, deploymentBlock } = resolved.value;

  try {
    const [incoming, outgoing] = await Promise.all([
      client.getLogs({
        address: identity,
        event: transferEvent,
        args: { to: owner },
        fromBlock: deploymentBlock,
        toBlock: "latest",
      }),
      client.getLogs({
        address: identity,
        event: transferEvent,
        args: { from: owner },
        fromBlock: deploymentBlock,
        toBlock: "latest",
      }),
    ]);

    type TransferLog = (typeof incoming)[number];
    const orderKey = (log: TransferLog): bigint =>
      log.blockNumber === null || log.logIndex === null
        ? 0n
        : log.blockNumber * 1_000_000n + BigInt(log.logIndex);

    const lastEventForToken = new Map<bigint, { order: bigint; isIncoming: boolean }>();
    const record = (logs: readonly TransferLog[], isIncoming: boolean): void => {
      for (const log of logs) {
        const tokenId = log.args.tokenId;
        if (tokenId === undefined) {
          continue;
        }
        const order = orderKey(log);
        const existing = lastEventForToken.get(tokenId);
        if (!existing || order >= existing.order) {
          lastEventForToken.set(tokenId, { order, isIncoming });
        }
      }
    };
    record(incoming, true);
    record(outgoing, false);

    const owned = [...lastEventForToken.entries()]
      .filter(([, v]) => v.isIncoming)
      .map(([tokenId]) => tokenId)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return ok(owned);
  } catch (cause) {
    return err(toRpcError(cause));
  }
}

/**
 * The v1 Identity Registry has no on-chain domain registry or resolution function
 * (see SOURCE.md — domains only ever appear as an optional off-chain field in the
 * agent registration file). This always returns null; it does not invent a mechanism.
 */
export function resolveByDomain(chainId: number, domain: string): Promise<Result<null>> {
  void chainId;
  void domain;
  return Promise.resolve(ok(null));
}

export async function getAgentBatch(
  chainId: number,
  agentIds: bigint[],
): Promise<Result<Array<Result<AgentRecord>>>> {
  const resolved = resolveClientAndConfig(chainId);
  if (!isOk(resolved)) {
    return resolved;
  }
  const { client, identity } = resolved.value;

  if (agentIds.length === 0) {
    return ok([]);
  }

  try {
    const contracts = agentIds.flatMap((agentId) => [
      { address: identity, abi: identityAbi, functionName: "ownerOf", args: [agentId] } as const,
      { address: identity, abi: identityAbi, functionName: "tokenURI", args: [agentId] } as const,
    ]);
    const results = await client.multicall({ contracts, allowFailure: true });

    // registeredAt is intentionally omitted (null) for batch reads: resolving it would
    // require a per-item log-scan, defeating the point of batching into one multicall.
    const items: Array<Result<AgentRecord>> = agentIds.map((agentId, index) => {
      const ownerResult = results[index * 2];
      const tokenUriResult = results[index * 2 + 1];
      if (!ownerResult || !tokenUriResult) {
        return err(toRpcError(new Error("multicall returned fewer results than requested")));
      }
      if (ownerResult.status === "failure") {
        return err(classifyContractError(ownerResult.error));
      }
      if (tokenUriResult.status === "failure") {
        return err(classifyContractError(tokenUriResult.error));
      }
      return ok({
        agentId,
        owner: ownerResult.result as Address,
        tokenUri: tokenUriResult.result as string,
        registeredAt: null,
      });
    });

    return ok(items);
  } catch (cause) {
    return err(toRpcError(cause));
  }
}
