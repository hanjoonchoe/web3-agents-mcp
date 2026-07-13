import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Abi, Address, Hex, PublicClient } from "viem";
import { getChainConfig } from "../chains/config.js";
import { getPublicClient } from "../chains/clients.js";
import { bridgeError } from "../shared/errors.js";
import { type Result, err, isOk, ok } from "../shared/result.js";
import { toRpcError } from "./errors.js";
import { getAgent } from "./identity.js";

/**
 * Typed reads for the ERC-8004 Validation Registry.
 *
 * ## Spec-name -> contract-name mapping (WP-4 R-2)
 *
 * | Module export (WP-4 spec name)              | Contract function(s) actually called                                    |
 * | ---------------------------------------------| --------------------------------------------------------------------------|
 * | `getValidations(chainId, agentId, {..})`      | `getAgentValidations(agentId)` (request-hash list) then, for the requested page only, a `multicall` of `getValidationStatus(requestHash)` per hash |
 *
 * `getAgentValidations` returns the full `bytes32[]` of request hashes for the agent
 * with no native offset/limit, so pagination (offset/limit, clamped to 200) is applied
 * to the hash list *before* fetching per-hash detail — unlike reputation's
 * `readFeedback`, this avoids decoding entries outside the requested page.
 *
 * ## `response` scale
 *
 * Unlike the Reputation Registry's free-form `value`, `ValidationRegistryUpgradeable`
 * contract-enforces `response` to `[0, 100]` (`require(response <= 100, "resp>100")` in
 * `validationResponse`). This is therefore already the canonical 0-100 scale required
 * by WP-4 R-7 with no rescaling needed; this module decodes it to a plain JS `number`
 * and passes it through unchanged as the `response` field (typed `unknown` per R-2,
 * since the minimal ABI cannot distinguish "validated with score 0" from "not yet
 * responded to" — see below).
 *
 * ## Known gap: pending vs. zero-scored validations are indistinguishable
 *
 * The full contract's `ValidationStatus` struct has a `hasResponse: bool` field, but
 * this project's minimal `validation.json` ABI (see SOURCE.md) intentionally excludes
 * it from `getValidationStatus`'s decoded outputs (only `validatorAddress, agentId,
 * response, responseHash, tag, lastUpdate` are exposed). A request that was made but
 * never responded to is therefore indistinguishable, via this ABI, from one that was
 * responded to with `response = 0`. `response` is surfaced as-is (raw decoded uint8)
 * without inventing a "pending" sentinel — documented here per R-2/R-3's "never guess"
 * principle. Widening `validation.json` to add `hasResponse` is out of scope for WP-4
 * (ABI edits require a STOP per the WP-2 authoritative note).
 *
 * ## Method classification
 *
 * `getValidationStatus` returns a free-text `tag` string set entirely by the
 * responding validator in `validationResponse` — there is no on-chain enum
 * constraining it to a fixed set of validation methods. Classification is therefore a
 * best-effort, case-insensitive **exact match** against the tag conventions
 * `"tee"`, `"zk"`, `"reexec"`; anything else (including an empty tag, or a tag that
 * merely contains one of those words as a substring) maps to `"other"`. This never
 * guesses from unrelated fields (e.g. validator address, response value) — only the
 * on-chain `tag` field is consulted, per R-2.
 *
 * ## Timestamp availability
 *
 * `lastUpdate` (`uint256`, `block.timestamp`) *is* stored on-chain and set both at
 * `validationRequest` and updated at `validationResponse` time — unlike the Reputation
 * Registry, this module does **not** need to fall back to `null`; every entry's
 * `timestamp` is the contract's `lastUpdate` value.
 *
 * ## Error mapping
 *
 * Agent existence is checked via `getAgent` (identity.ts) before any validation call
 * (AGENT_NOT_FOUND flows from there for unregistered agents). Validation Registry
 * calls themselves have no existence-revert semantics for an unknown `agentId` (they
 * are plain mappings, returning an empty hash list); a genuinely failing
 * `getValidationStatus` call (e.g. mid-flight revert on a stale/removed hash) is mapped
 * with the generic `toRpcError` (RPC_ERROR, retryable, cause preserved) — never a raw
 * throw.
 */

function loadAbi(name: string): Abi {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(path.join(here, "abi", `${name}.json`), "utf8");
  return JSON.parse(raw) as Abi;
}

const validationAbi = loadAbi("validation");

export type ValidationMethod = "tee" | "zk" | "reexec" | "other";

export type ValidationEntry = {
  validator: Address;
  method: ValidationMethod;
  requestHash: Hex | null;
  response: unknown;
  timestamp: bigint | null;
};

export type PageOptions = { limit: number; offset: number };

export type ValidationsPage = { entries: ValidationEntry[]; total: number };

const MAX_LIMIT = 200;
const KNOWN_METHODS: readonly ValidationMethod[] = ["tee", "zk", "reexec"];

function clampLimit(limit: number): number {
  return Math.max(0, Math.min(limit, MAX_LIMIT));
}

function clampOffset(offset: number): number {
  return Math.max(0, offset);
}

function classifyMethod(tag: string): ValidationMethod {
  const normalized = tag.trim().toLowerCase();
  const match = KNOWN_METHODS.find((method) => method === normalized);
  return match ?? "other";
}

function resolveClientAndConfig(
  chainId: number,
): Result<{ client: PublicClient; validation: Address }> {
  const clientResult = getPublicClient(chainId);
  if (!isOk(clientResult)) {
    return clientResult;
  }
  const config = getChainConfig(chainId);
  if (!config) {
    return err(bridgeError("CHAIN_UNSUPPORTED", `chainId ${chainId} is not supported`));
  }
  return ok({ client: clientResult.value, validation: config.registries.validation });
}

export async function getValidations(
  chainId: number,
  agentId: bigint,
  { limit, offset }: PageOptions,
): Promise<Result<ValidationsPage>> {
  const agentCheck = await getAgent(chainId, agentId);
  if (!isOk(agentCheck)) {
    return agentCheck;
  }

  const resolved = resolveClientAndConfig(chainId);
  if (!isOk(resolved)) {
    return resolved;
  }
  const { client, validation } = resolved.value;

  let hashes: readonly Hex[];
  try {
    hashes = (await client.readContract({
      address: validation,
      abi: validationAbi,
      functionName: "getAgentValidations",
      args: [agentId],
    })) as readonly Hex[];
  } catch (cause) {
    return err(toRpcError(cause));
  }

  const total = hashes.length;
  if (total === 0) {
    return ok({ entries: [], total: 0 });
  }

  const clampedLimit = clampLimit(limit);
  const clampedOffset = clampOffset(offset);
  const page = hashes.slice(clampedOffset, clampedOffset + clampedLimit);

  if (page.length === 0) {
    return ok({ entries: [], total });
  }

  try {
    const contracts = page.map(
      (hash) =>
        ({
          address: validation,
          abi: validationAbi,
          functionName: "getValidationStatus",
          args: [hash],
        }) as const,
    );
    const results = await client.multicall({ contracts, allowFailure: true });

    const entries: ValidationEntry[] = [];
    for (const [index, hash] of page.entries()) {
      const result = results[index];
      if (!result) {
        return err(toRpcError(new Error("multicall returned fewer results than requested")));
      }
      if (result.status === "failure") {
        return err(toRpcError(result.error));
      }
      const [validatorAddress, , response, , tag, lastUpdate] = result.result as [
        Address,
        bigint,
        number,
        Hex,
        string,
        bigint,
      ];
      entries.push({
        validator: validatorAddress,
        method: classifyMethod(tag),
        requestHash: hash,
        response,
        timestamp: lastUpdate,
      });
    }

    return ok({ entries, total });
  } catch (cause) {
    return err(toRpcError(cause));
  }
}
