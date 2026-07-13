import { z } from "zod";
import { getChainConfig, supportedSlugs } from "./config.js";

const FALLBACK_DEFAULT_CHAIN_ID = 8453;

/**
 * Shared `chain` input schema for every MCP tool, built dynamically from the
 * configured chains (`src/chains/config.ts`) at module-load time — a zod enum of
 * canonical slugs (e.g. `"base"`, `"ethereum"`) rather than a hardcoded list, so
 * adding a chain to config automatically widens every tool's schema on next server
 * start with no other code change (WP-6.5 R-2/second amendment).
 *
 * Tool inputs are human/agent-readable names, not numeric EIP-155 chainIds — the
 * numeric id remains the internal representation used by every layer below the tool
 * edge (registry, chains, fetcher, trust) and still appears in tool *outputs*
 * alongside the slug.
 *
 * This is enforced by the MCP SDK at the transport boundary (an unknown `chain`
 * value in a tool call is rejected before the tool function ever runs). The runtime
 * `CHAIN_UNSUPPORTED` check in `src/chains/clients.ts` (`getPublicClient`) stays in
 * place as defense-in-depth for any caller that reaches the numeric-chainId layer
 * directly (e.g. tests, or a future non-MCP entry point) bypassing schema
 * validation.
 */
function buildChainSchema() {
  const slugs = supportedSlugs();
  const [first, second, ...rest] = slugs;
  if (!first) {
    throw new Error("no configured chains — supportedSlugs() returned an empty list");
  }
  const enumSchema = second ? z.enum([first, second, ...rest]) : z.literal(first);
  const defaultSlug = getChainConfig(FALLBACK_DEFAULT_CHAIN_ID)?.slug ?? "base";
  return enumSchema
    .optional()
    .describe(`Chain to query, by name (see list_chains). Defaults to ${defaultSlug}.`);
}

export const chainSchema = buildChainSchema();
export type ChainInput = z.infer<typeof chainSchema>;
