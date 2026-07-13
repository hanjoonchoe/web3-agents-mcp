import { createPublicClient, fallback, http, type Chain, type PublicClient } from "viem";
import { base, mainnet } from "viem/chains";
import { bridgeError } from "../shared/errors.js";
import { type Result, err, ok } from "../shared/result.js";
import { getChainConfig } from "./config.js";

const VIEM_CHAINS: Record<number, Chain> = {
  1: mainnet,
  8453: base,
};

// Lazy per-chain client pool: a chain's client (and its fallback transport) is built
// once on first use and reused for the process lifetime.
const clientPool = new Map<number, PublicClient>();

export function getPublicClient(chainId: number): Result<PublicClient> {
  const cached = clientPool.get(chainId);
  if (cached) {
    return ok(cached);
  }

  const config = getChainConfig(chainId);
  const chain = VIEM_CHAINS[chainId];
  if (!config || !chain) {
    return err(bridgeError("CHAIN_UNSUPPORTED", `chainId ${chainId} is not supported`));
  }

  const transport = fallback(config.rpcUrls.map((url) => http(url)));
  const client = createPublicClient({ chain, transport });

  clientPool.set(chainId, client);
  return ok(client);
}

/** Test-only: clears the pool so env var / mock changes take effect across cases. */
export function resetClientPool(): void {
  clientPool.clear();
}
