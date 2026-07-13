import { BaseError, ContractFunctionRevertedError } from "viem";
import { type BridgeError, bridgeError } from "../shared/errors.js";

// Revert reasons that map to AGENT_NOT_FOUND rather than a generic RPC_ERROR.
// ERC721NonexistentToken is the ERC-721 revert raised by ownerOf/tokenURI for an
// agentId that was never minted (or has been burned, which this registry never does).
const NOT_FOUND_ERROR_NAMES = new Set(["ERC721NonexistentToken"]);

/**
 * Maps a thrown viem error (from a readContract/multicall call against the Identity
 * Registry) to a BridgeError. Nonexistent-token reverts become AGENT_NOT_FOUND
 * (not retryable); everything else — network errors, timeouts, malformed responses,
 * unrecognized reverts — becomes RPC_ERROR (retryable), with the original error
 * preserved as `cause`. No raw viem/JS exception is ever allowed to cross this
 * module's boundary.
 */
export function classifyContractError(cause: unknown): BridgeError {
  if (cause instanceof BaseError) {
    const revertError = cause.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revertError instanceof ContractFunctionRevertedError) {
      const errorName = revertError.data?.errorName;
      if (errorName !== undefined && NOT_FOUND_ERROR_NAMES.has(errorName)) {
        return bridgeError("AGENT_NOT_FOUND", `agent not found (${errorName})`, { cause });
      }
    }
  }
  return toRpcError(cause);
}

/** Maps any non-revert failure (network, timeout, decoding, ...) to RPC_ERROR. */
export function toRpcError(cause: unknown): BridgeError {
  const message = cause instanceof Error ? cause.message : "rpc call failed";
  return bridgeError("RPC_ERROR", message, { retryable: true, cause });
}
