import { z } from "zod";
import { listStaticChainConfigs } from "../chains/config.js";
import { type Result, ok } from "../shared/result.js";

/**
 * `list_chains` MCP tool (WP-6.5 R-2). No required input; a pure read of
 * `src/chains/config.ts` — no RPC calls. `isDefault` reflects `DEFAULT_CHAIN_ID` env
 * resolution at call time, so it can change across calls without a server restart.
 */

export const listChainsInputShape = {};
export const listChainsInputSchema = z.object(listChainsInputShape);
export type ListChainsInput = z.infer<typeof listChainsInputSchema>;

const chainEntryOutputSchema = z.object({
  chain: z.string(),
  chainId: z.number(),
  name: z.string(),
  isDefault: z.boolean(),
  registries: z.object({
    identity: z.string(),
    reputation: z.string(),
    validation: z.string(),
  }),
  rpcOverrideEnv: z.string(),
});

export const listChainsOutputSchema = z.object({
  chains: z.array(chainEntryOutputSchema),
  defaultChainId: z.number(),
});
export type ListChainsOutput = z.infer<typeof listChainsOutputSchema>;

const FALLBACK_DEFAULT_CHAIN_ID = 8453;

function resolveDefaultChainId(): number {
  const envValue = process.env["DEFAULT_CHAIN_ID"];
  const parsed = envValue !== undefined ? Number(envValue) : NaN;
  return Number.isInteger(parsed) ? parsed : FALLBACK_DEFAULT_CHAIN_ID;
}

export function listChains(): Result<ListChainsOutput> {
  const defaultChainId = resolveDefaultChainId();
  const chains = listStaticChainConfigs().map((c) => ({
    chain: c.slug,
    chainId: c.chainId,
    name: c.name,
    isDefault: c.chainId === defaultChainId,
    registries: c.registries,
    rpcOverrideEnv: c.rpcOverrideEnv,
  }));
  return ok({ chains, defaultChainId });
}
