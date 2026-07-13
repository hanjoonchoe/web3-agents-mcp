import { bridgeError } from "../shared/errors.js";
import { err, type Result } from "../shared/result.js";
import type { IndexerBackend, SearchHit, SyncStatus } from "./backend.js";

/**
 * Stub `IndexerBackend`: no local index exists yet, so every call fails with
 * INDEX_UNAVAILABLE. This is the only backend implemented in the MVP; a real,
 * locally-synced backend is planned for a future release (WP-6 Part A, A-2).
 */
export class NullBackend implements IndexerBackend {
  readonly name = "null";

  ensureSynced(_chainId: number): Promise<Result<SyncStatus>> {
    return Promise.resolve(
      err(
        bridgeError(
          "INDEX_UNAVAILABLE",
          "no local index backend is configured; a local index backend ships in a future release",
        ),
      ),
    );
  }

  search(_chainId: number, _query: string, _limit: number): Promise<Result<SearchHit[]>> {
    return Promise.resolve(
      err(
        bridgeError(
          "INDEX_UNAVAILABLE",
          "no local index backend is configured; a local index backend ships in a future release",
        ),
      ),
    );
  }
}
