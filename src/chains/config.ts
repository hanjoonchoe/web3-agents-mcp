import type { Address } from "viem";

export type ChainConfig = {
  chainId: number;
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
    registries: { identity: IDENTITY, reputation: REPUTATION, validation: VALIDATION },
    // Derived via eth_getCode binary search against a public RPC — see SOURCE.md.
    deploymentBlock: 41663783n,
    defaultRpcUrls: [
      "https://mainnet.base.org",
      "https://base-rpc.publicnode.com",
      "https://base.llamarpc.com",
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
