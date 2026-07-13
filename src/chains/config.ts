import type { Address } from "viem";

export type ChainConfig = {
  chainId: number;
  /** Canonical, stable, lowercase slug — the value MCP tool inputs accept as `chain`. */
  slug: string;
  name: string;
  rpcUrls: string[];
  registries: { identity: Address; reputation: Address; validation: Address };
  deploymentBlock: bigint;
};

// Same CREATE2 vanity-salt deployment across every mainnet chain.
// Provenance: src/registry/abi/SOURCE.md
const IDENTITY: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const REPUTATION: Address = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";
const VALIDATION: Address = "0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58";

type StaticChainConfig = Omit<ChainConfig, "rpcUrls"> & { defaultRpcUrls: string[] };

// Default RPC URLs are keyless public endpoints; the first entry does not need to be
// the fastest since viem's fallback() transport tries each in order and only moves on
// after a failure.
const STATIC_CONFIGS: Record<number, StaticChainConfig> = {
  1: {
    chainId: 1,
    name: "ethereum",
    slug: "ethereum",
    registries: { identity: IDENTITY, reputation: REPUTATION, validation: VALIDATION },
    // Derived via eth_getCode binary search against a public archive RPC — see SOURCE.md.
    deploymentBlock: 24339871n,
    defaultRpcUrls: [
      "https://eth.llamarpc.com",
      "https://ethereum-rpc.publicnode.com",
      "https://eth.drpc.org",
    ],
  },
  8453: {
    chainId: 8453,
    name: "base",
    slug: "base",
    registries: { identity: IDENTITY, reputation: REPUTATION, validation: VALIDATION },
    // Derived via eth_getCode binary search against a public RPC — see SOURCE.md.
    deploymentBlock: 41663783n,
    defaultRpcUrls: [
      "https://mainnet.base.org",
      "https://base-rpc.publicnode.com",
      "https://base.llamarpc.com",
    ],
  },
  137: {
    chainId: 137,
    name: "polygon",
    slug: "polygon",
    registries: { identity: IDENTITY, reputation: REPUTATION, validation: VALIDATION },
    // Derived via eth_getCode binary search against a public archive RPC — see SOURCE.md.
    deploymentBlock: 82458484n,
    defaultRpcUrls: [
      "https://polygon-bor-rpc.publicnode.com",
      "https://polygon.drpc.org",
      "https://polygon-rpc.com",
    ],
  },
  42161: {
    chainId: 42161,
    name: "arbitrum",
    slug: "arbitrum",
    registries: { identity: IDENTITY, reputation: REPUTATION, validation: VALIDATION },
    // Derived via eth_getCode binary search against a public archive RPC — see SOURCE.md.
    deploymentBlock: 428895443n,
    defaultRpcUrls: [
      "https://arb1.arbitrum.io/rpc",
      "https://arbitrum.drpc.org",
      "https://arbitrum-one-rpc.publicnode.com",
    ],
  },
  10: {
    chainId: 10,
    name: "optimism",
    slug: "optimism",
    registries: { identity: IDENTITY, reputation: REPUTATION, validation: VALIDATION },
    // Derived via eth_getCode binary search against a public RPC — see SOURCE.md.
    deploymentBlock: 147514947n,
    defaultRpcUrls: [
      "https://mainnet.optimism.io",
      "https://optimism-rpc.publicnode.com",
      "https://optimism.llamarpc.com",
    ],
  },
  56: {
    chainId: 56,
    name: "bnb",
    slug: "bnb",
    registries: { identity: IDENTITY, reputation: REPUTATION, validation: VALIDATION },
    // Derived via eth_getCode binary search against a public archive RPC — see SOURCE.md.
    deploymentBlock: 79027268n,
    defaultRpcUrls: [
      "https://bsc-dataseed.binance.org",
      "https://bsc-rpc.publicnode.com",
      "https://bsc.llamarpc.com",
    ],
  },
  100: {
    chainId: 100,
    name: "gnosis",
    slug: "gnosis",
    registries: { identity: IDENTITY, reputation: REPUTATION, validation: VALIDATION },
    // Derived via eth_getCode binary search against a public RPC — see SOURCE.md.
    deploymentBlock: 44505010n,
    defaultRpcUrls: [
      "https://rpc.gnosischain.com",
      "https://gnosis.publicnode.com",
      "https://gnosis.drpc.org",
    ],
  },
};

function rpcUrlsFor(chainId: number, defaults: string[]): string[] {
  const override = process.env[`RPC_URL_${chainId}`];
  return override !== undefined && override.length > 0 ? [override, ...defaults] : defaults;
}

export function getChainConfig(chainId: number): ChainConfig | undefined {
  const staticConfig = STATIC_CONFIGS[chainId];
  if (!staticConfig) {
    return undefined;
  }
  const { defaultRpcUrls, ...rest } = staticConfig;
  return { ...rest, rpcUrls: rpcUrlsFor(chainId, defaultRpcUrls) };
}

export function supportedChainIds(): number[] {
  return Object.keys(STATIC_CONFIGS).map(Number);
}

/** Canonical slugs of every configured chain, in the same order as `supportedChainIds`. */
export function supportedSlugs(): string[] {
  return Object.values(STATIC_CONFIGS)
    .sort((a, b) => a.chainId - b.chainId)
    .map((c) => c.slug);
}

/** Numeric chainId for a configured slug, or `undefined` if the slug is not configured. */
export function chainIdForSlug(slug: string): number | undefined {
  return Object.values(STATIC_CONFIGS).find((c) => c.slug === slug)?.chainId;
}

/** Slug for a configured numeric chainId, or `undefined` if the chainId is not configured. */
export function slugForChainId(chainId: number): string | undefined {
  return STATIC_CONFIGS[chainId]?.slug;
}

/**
 * Resolves either a canonical slug (e.g. `"base"`) or a numeric chainId (e.g. `8453`)
 * to its full `ChainConfig`. Internal helper — MCP tool inputs accept slugs only, but
 * this accepts either form for callers that already have a numeric id on hand.
 */
export function resolveChain(slugOrId: string | number): ChainConfig | undefined {
  if (typeof slugOrId === "number") {
    return getChainConfig(slugOrId);
  }
  const chainId = chainIdForSlug(slugOrId);
  return chainId !== undefined ? getChainConfig(chainId) : undefined;
}

/** Name of the env var that overrides/prepends the RPC URL used for a given chain. */
export function rpcOverrideEnvFor(chainId: number): string {
  return `RPC_URL_${chainId}`;
}

/**
 * Static, per-chain metadata only (slug/name/registries/rpcOverrideEnv) — no
 * RPC-derived fields — for `list_chains` (a pure config read, no network calls per
 * WP-6.5 R-2).
 */
export function listStaticChainConfigs(): Array<{
  chainId: number;
  slug: string;
  name: string;
  registries: { identity: Address; reputation: Address; validation: Address };
  rpcOverrideEnv: string;
}> {
  return Object.values(STATIC_CONFIGS)
    .map((c) => ({
      chainId: c.chainId,
      slug: c.slug,
      name: c.name,
      registries: c.registries,
      rpcOverrideEnv: rpcOverrideEnvFor(c.chainId),
    }))
    .sort((a, b) => a.chainId - b.chainId);
}
