import { z } from "zod";
import type { IndexerBackend } from "../indexer/backend.js";
import { NullBackend } from "../indexer/null-backend.js";
import { chainSchema } from "../chains/schema.js";
import { chainIdForSlug, slugForChainId } from "../chains/config.js";
import { bridgeError } from "../shared/errors.js";
import { type Result, err, isOk, ok } from "../shared/result.js";

/**
 * `search_agents` MCP tool (WP-6 Part A stub). Only a `NullBackend` is implemented
 * in the MVP, so every call currently fails with INDEX_UNAVAILABLE — see
 * src/indexer/null-backend.ts. Input validation still runs first (a too-short
 * `query` is INVALID_INPUT even though the backend would fail anyway), so callers
 * get precise feedback once a real backend ships.
 *
 * Backend selection: `INDEX_BACKEND` env var, default `"null"`. Only `"null"` is
 * implemented; any other value is INDEX_UNAVAILABLE naming the valid values.
 */

const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const VALID_BACKEND_NAMES = ["null"] as const;

export const searchAgentsInputShape = {
  chain: chainSchema,
  query: z.string().min(MIN_QUERY_LENGTH, `query must be at least ${MIN_QUERY_LENGTH} characters`),
  limit: z.number().int().positive().optional().default(DEFAULT_LIMIT),
};
export const searchAgentsInputSchema = z.object(searchAgentsInputShape);
export type SearchAgentsInput = z.infer<typeof searchAgentsInputSchema>;

const searchHitOutputSchema = z.object({
  agentId: z.string(),
  chain: z.string(),
  chainId: z.number(),
  name: z.string().nullable(),
  matchedOn: z.enum(["name", "capability", "description"]),
  capabilities: z.array(z.string()),
});

export const searchAgentsOutputSchema = z.object({
  backend: z.string(),
  results: z.array(searchHitOutputSchema),
  indexFreshBlock: z.string().nullable(),
  indexFreshAt: z.string().nullable(),
});
export type SearchAgentsOutput = z.infer<typeof searchAgentsOutputSchema>;

function resolveChainId(chain: string | undefined): number {
  if (chain !== undefined) {
    const id = chainIdForSlug(chain);
    if (id !== undefined) {
      return id;
    }
  }
  const envValue = process.env["DEFAULT_CHAIN_ID"];
  const parsed = envValue !== undefined ? Number(envValue) : NaN;
  return Number.isInteger(parsed) ? parsed : 8453;
}

/** Exported for tests: constructs the backend named by `INDEX_BACKEND` (default "null"). */
export function resolveBackend(): Result<IndexerBackend> {
  const raw = process.env["INDEX_BACKEND"];
  const name = raw !== undefined && raw.length > 0 ? raw : "null";
  if (name === "null") {
    return ok(new NullBackend());
  }
  return err(
    bridgeError(
      "INDEX_UNAVAILABLE",
      `unknown INDEX_BACKEND "${name}"; valid values: ${VALID_BACKEND_NAMES.join(", ")}`,
    ),
  );
}

export async function searchAgents(input: unknown): Promise<Result<SearchAgentsOutput>> {
  const parsed = searchAgentsInputSchema.safeParse(input);
  if (!parsed.success) {
    return err(bridgeError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; ")));
  }
  const { chain, query, limit } = parsed.data;
  const chainId = resolveChainId(chain);
  const clampedLimit = Math.min(limit, MAX_LIMIT);

  const backendResult = resolveBackend();
  if (!isOk(backendResult)) {
    return backendResult;
  }
  const backend = backendResult.value;

  const syncResult = await backend.ensureSynced(chainId);
  if (!isOk(syncResult)) {
    return syncResult;
  }
  const syncStatus = syncResult.value;

  const searchResult = await backend.search(chainId, query, clampedLimit);
  if (!isOk(searchResult)) {
    return searchResult;
  }

  return ok({
    backend: backend.name,
    results: searchResult.value.map((hit) => ({
      agentId: hit.agentId.toString(),
      chain: slugForChainId(hit.chainId) ?? String(hit.chainId),
      chainId: hit.chainId,
      name: hit.name,
      matchedOn: hit.matchedOn,
      capabilities: hit.capabilities,
    })),
    indexFreshBlock: syncStatus.freshBlock.toString(),
    indexFreshAt: syncStatus.freshAt,
  });
}
