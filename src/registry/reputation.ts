import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Abi, Address, PublicClient } from "viem";
import { getChainConfig } from "../chains/config.js";
import { getPublicClient } from "../chains/clients.js";
import { bridgeError } from "../shared/errors.js";
import { type Result, err, isOk, ok } from "../shared/result.js";
import { toRpcError } from "./errors.js";
import { getAgent } from "./identity.js";

/**
 * Typed reads for the ERC-8004 Reputation Registry.
 *
 * ## Spec-name -> contract-name mapping (WP-4 R-1)
 *
 * | Module export (WP-4 spec name)          | Contract function(s) actually called                                   |
 * | ---------------------------------------- | ------------------------------------------------------------------------ |
 * | `getSummary(chainId, agentId)`           | `getClients(agentId)` then, if non-empty, `getSummary(agentId, clients, "", "")` |
 * | `readFeedback(chainId, agentId, {..})`   | `readAllFeedback(agentId, [], "", "", false)`, paginated client-side     |
 *
 * The deployed `ReputationRegistryUpgradeable.getSummary` **reverts** ("clientAddresses
 * required") if called with an empty `clientAddresses` array — it has no "all clients"
 * sentinel. So an agent's full-population summary is only obtainable by first reading
 * `getClients(agentId)` and feeding that full list back in. When `getClients` returns
 * `[]` (agent has never received feedback) we skip the `getSummary` call entirely and
 * return the zero-feedback shape directly, rather than triggering that revert.
 *
 * `readAllFeedback`, by contrast, treats an empty `clientAddresses` array as "all
 * clients" (see contract source), so `readFeedback` uses it directly with `[]` — no
 * `getClients` call is needed. The contract exposes no native offset/limit for either
 * function, so `readFeedback` paginates the full decoded array client-side.
 *
 * ## Score scale (assumption — see WP-4 report Deviations)
 *
 * `giveFeedback(agentId, value, valueDecimals, ...)` accepts any signed `int128 value`
 * in `[-1e38, 1e38]` with `valueDecimals` in `[0, 18]` — the contract enforces **no**
 * canonical range or unit for a "score". There is no spec-mandated 0-100 convention on
 * this contract (contrast with the sibling ValidationRegistry, whose `response` field
 * *is* contract-enforced to `[0, 100]`). This module assumes the common ERC-8004
 * ecosystem convention that feedback values are intended as a 0-100 rating and:
 *   1. decodes the raw value as `Number(value) / 10 ** valueDecimals`;
 *   2. clamps the result to `[0, 100]`.
 * If a real submitter uses a different scale (e.g. a raw -1..1 sentiment score) this
 * will silently misrepresent it as a clamped boundary value. This is a best-effort
 * mapping, not a verified on-chain guarantee — flagged as Deviation #1 in the WP-4
 * completion report.
 *
 * ## Timestamp availability
 *
 * Neither `getSummary` nor `readFeedback`/`readAllFeedback` return any timestamp. The
 * only timestamp-bearing signal is the `NewFeedback` event, which is intentionally
 * excluded from this project's minimal `reputation.json` ABI (see SOURCE.md — WP-4 is
 * scoped to read-function decoding, not event log scans, and the spec's out-of-scope
 * list excludes chunked log scans). `lastFeedbackAt` (summary) and `timestamp` (each
 * feedback entry) are therefore **always `null`** — explicitly, per R-1's documented
 * null policy for fields the contract doesn't provide.
 *
 * ## `tag` and `uri` fields
 *
 * The contract stores two free-text tags per feedback item (`tag1`, `tag2`) but no URI
 * for individual feedback (a `feedbackURI` is only ever emitted in the `NewFeedback`
 * event, not returned by any read function in the minimal ABI). This module surfaces
 * `tag1` as the single `tag` field (empty string -> `null`); `tag2` is not exposed by
 * this minimal read view. `uri` is always `null` (no read-function source exists).
 *
 * ## Error mapping
 *
 * Agent existence is checked via `getAgent` (identity.ts) before any reputation call,
 * reusing its existing revert classification — so `AGENT_NOT_FOUND` for unregistered
 * agents flows from there. Reputation Registry calls themselves have no
 * existence-revert semantics (they are plain mappings keyed by `agentId`, returning
 * empty results for an unknown id rather than reverting), so failures from those calls
 * are mapped with the generic `toRpcError` (RPC_ERROR, retryable, cause preserved) —
 * never a raw throw.
 */

function loadAbi(name: string): Abi {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(path.join(here, "abi", `${name}.json`), "utf8");
  return JSON.parse(raw) as Abi;
}

const reputationAbi = loadAbi("reputation");

export type FeedbackSummary = {
  count: bigint;
  averageScore: number | null;
  lastFeedbackAt: bigint | null;
};

export type FeedbackEntry = {
  client: Address;
  score: number;
  tag: string | null;
  uri: string | null;
  timestamp: bigint | null;
};

export type PageOptions = { limit: number; offset: number };

const MAX_LIMIT = 200;

function clampLimit(limit: number): number {
  return Math.max(0, Math.min(limit, MAX_LIMIT));
}

function clampOffset(offset: number): number {
  return Math.max(0, offset);
}

/** Decodes an on-chain (value, valueDecimals) pair to a best-effort 0-100 score. */
function normalizeScore(value: bigint, decimals: number): number {
  const raw = Number(value) / 10 ** decimals;
  return Math.max(0, Math.min(100, raw));
}

function resolveClientAndConfig(
  chainId: number,
): Result<{ client: PublicClient; reputation: Address }> {
  const clientResult = getPublicClient(chainId);
  if (!isOk(clientResult)) {
    return clientResult;
  }
  const config = getChainConfig(chainId);
  if (!config) {
    return err(bridgeError("CHAIN_UNSUPPORTED", `chainId ${chainId} is not supported`));
  }
  return ok({ client: clientResult.value, reputation: config.registries.reputation });
}

export async function getSummary(
  chainId: number,
  agentId: bigint,
): Promise<Result<FeedbackSummary>> {
  const agentCheck = await getAgent(chainId, agentId);
  if (!isOk(agentCheck)) {
    return agentCheck;
  }

  const resolved = resolveClientAndConfig(chainId);
  if (!isOk(resolved)) {
    return resolved;
  }
  const { client, reputation } = resolved.value;

  let clients: readonly Address[];
  try {
    clients = (await client.readContract({
      address: reputation,
      abi: reputationAbi,
      functionName: "getClients",
      args: [agentId],
    })) as readonly Address[];
  } catch (cause) {
    return err(toRpcError(cause));
  }

  if (clients.length === 0) {
    return ok({ count: 0n, averageScore: null, lastFeedbackAt: null });
  }

  try {
    const [count, summaryValue, summaryValueDecimals] = (await client.readContract({
      address: reputation,
      abi: reputationAbi,
      functionName: "getSummary",
      args: [agentId, clients, "", ""],
    })) as [bigint, bigint, number];

    if (count === 0n) {
      return ok({ count: 0n, averageScore: null, lastFeedbackAt: null });
    }
    return ok({
      count,
      averageScore: normalizeScore(summaryValue, summaryValueDecimals),
      lastFeedbackAt: null,
    });
  } catch (cause) {
    return err(toRpcError(cause));
  }
}

export async function readFeedback(
  chainId: number,
  agentId: bigint,
  { limit, offset }: PageOptions,
): Promise<Result<FeedbackEntry[]>> {
  const agentCheck = await getAgent(chainId, agentId);
  if (!isOk(agentCheck)) {
    return agentCheck;
  }

  const resolved = resolveClientAndConfig(chainId);
  if (!isOk(resolved)) {
    return resolved;
  }
  const { client, reputation } = resolved.value;

  const clampedLimit = clampLimit(limit);
  const clampedOffset = clampOffset(offset);

  try {
    const [clients, , values, valueDecimals, tag1s] = (await client.readContract({
      address: reputation,
      abi: reputationAbi,
      functionName: "readAllFeedback",
      args: [agentId, [], "", "", false],
    })) as [
      readonly Address[],
      readonly bigint[],
      readonly bigint[],
      readonly number[],
      readonly string[],
      readonly string[],
      readonly boolean[],
    ];

    const entries: FeedbackEntry[] = clients.map((clientAddress, index) => ({
      client: clientAddress,
      score: normalizeScore(values[index] ?? 0n, valueDecimals[index] ?? 0),
      tag: tag1s[index] && tag1s[index].length > 0 ? tag1s[index] : null,
      uri: null,
      timestamp: null,
    }));

    return ok(entries.slice(clampedOffset, clampedOffset + clampedLimit));
  } catch (cause) {
    return err(toRpcError(cause));
  }
}
