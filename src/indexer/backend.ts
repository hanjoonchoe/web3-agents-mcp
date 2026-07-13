import type { Result } from "../shared/result.js";

/**
 * `search_agents` indexer backend contract (WP-6 Part A). The MVP ships only a
 * `NullBackend` (see null-backend.ts) — there is no local index yet, so every call
 * fails with INDEX_UNAVAILABLE. This interface exists so a future release can add a
 * real backend (e.g. a local sqlite index built by crawling the on-chain registries)
 * without changing the `search_agents` tool's input/output contract.
 */

export type SyncStatus = {
  /** Most recent chain block the index has ingested. */
  freshBlock: bigint;
  /** ISO-8601 timestamp corresponding to `freshBlock`. */
  freshAt: string;
  /** Whether a sync is currently in progress. */
  syncing: boolean;
};

export type SearchHit = {
  agentId: bigint;
  chainId: number;
  name: string | null;
  matchedOn: "name" | "capability" | "description";
  capabilities: string[];
};

export interface IndexerBackend {
  readonly name: string;
  ensureSynced(chainId: number): Promise<Result<SyncStatus>>;
  search(chainId: number, query: string, limit: number): Promise<Result<SearchHit[]>>;
}
