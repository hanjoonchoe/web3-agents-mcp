import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  chainIdForSlug,
  getChainConfig,
  resolveChain,
  slugForChainId,
  supportedChainIds,
  supportedSlugs,
} from "../../src/chains/config.js";

const ENV_KEY = "RPC_URL_8453";
const originalEnvValue = process.env[ENV_KEY];

const NEW_CHAINS = [
  { chainId: 137, slug: "polygon", name: "polygon" },
  { chainId: 42161, slug: "arbitrum", name: "arbitrum" },
  { chainId: 10, slug: "optimism", name: "optimism" },
  { chainId: 56, slug: "bnb", name: "bnb" },
  { chainId: 100, slug: "gnosis", name: "gnosis" },
];

describe("getChainConfig", () => {
  afterEach(() => {
    if (originalEnvValue === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnvValue;
    }
  });

  it("returns a config for Ethereum mainnet (1)", () => {
    const config = getChainConfig(1);
    expect(config).toBeDefined();
    expect(config?.chainId).toBe(1);
    expect(config?.name).toBe("ethereum");
    expect(config?.slug).toBe("ethereum");
    expect(config?.rpcUrls.length).toBeGreaterThan(0);
    expect(config?.registries.identity).toMatch(/^0x/);
    expect(config?.deploymentBlock).toBe(24339871n);
  });

  it("returns a config for Base (8453)", () => {
    const config = getChainConfig(8453);
    expect(config).toBeDefined();
    expect(config?.chainId).toBe(8453);
    expect(config?.name).toBe("base");
    expect(config?.slug).toBe("base");
    expect(config?.deploymentBlock).toBe(41663783n);
  });

  it("returns undefined for an unsupported chainId", () => {
    expect(getChainConfig(999999)).toBeUndefined();
  });

  it("uses the same registry addresses on every configured chain", () => {
    const ethereum = getChainConfig(1);
    for (const { chainId } of NEW_CHAINS) {
      const config = getChainConfig(chainId);
      expect(config?.registries).toEqual(ethereum?.registries);
    }
    expect(getChainConfig(8453)?.registries).toEqual(ethereum?.registries);
  });

  it("lists exactly the supported chainIds, including the 5 new chains", () => {
    expect(supportedChainIds().sort((a, b) => a - b)).toEqual(
      [1, 8453, 137, 42161, 10, 56, 100].sort((a, b) => a - b),
    );
  });

  it("lists exactly the supported slugs", () => {
    expect(supportedSlugs().sort()).toEqual(
      ["ethereum", "base", "polygon", "arbitrum", "optimism", "bnb", "gnosis"].sort(),
    );
  });

  it.each(NEW_CHAINS)(
    "new chain $slug ($chainId): config present, deploymentBlock > 0, at least 2 rpcUrls",
    ({ chainId, slug, name }) => {
      const config = getChainConfig(chainId);
      expect(config).toBeDefined();
      expect(config?.chainId).toBe(chainId);
      expect(config?.slug).toBe(slug);
      expect(config?.name).toBe(name);
      expect(config?.deploymentBlock).toBeGreaterThan(0n);
      expect(config?.rpcUrls.length).toBeGreaterThanOrEqual(2);
      expect(config?.registries.identity).toMatch(/^0x/);
    },
  );

  describe("chainIdForSlug / slugForChainId / resolveChain", () => {
    it("round-trips slug <-> chainId for every configured chain", () => {
      for (const chainId of supportedChainIds()) {
        const slug = slugForChainId(chainId);
        expect(slug).toBeDefined();
        expect(chainIdForSlug(slug as string)).toBe(chainId);
      }
    });

    it("returns undefined for an unknown slug or chainId", () => {
      expect(chainIdForSlug("not-a-real-chain")).toBeUndefined();
      expect(slugForChainId(999999)).toBeUndefined();
    });

    it("resolveChain accepts either a slug or a numeric chainId", () => {
      const bySlug = resolveChain("base");
      const byId = resolveChain(8453);
      expect(bySlug).toBeDefined();
      expect(byId).toBeDefined();
      expect(bySlug?.chainId).toBe(8453);
      expect(byId?.chainId).toBe(8453);
    });

    it("resolveChain returns undefined for an unsupported slug or chainId", () => {
      expect(resolveChain("not-a-real-chain")).toBeUndefined();
      expect(resolveChain(999999)).toBeUndefined();
    });
  });

  describe("RPC_URL_<chainId> override", () => {
    beforeEach(() => {
      delete process.env[ENV_KEY];
    });

    it("prepends the env override to the default rpcUrls", () => {
      process.env[ENV_KEY] = "https://custom-rpc.example/base";
      const config = getChainConfig(8453);
      expect(config?.rpcUrls[0]).toBe("https://custom-rpc.example/base");
      expect(config?.rpcUrls.length).toBeGreaterThan(1);
    });

    it("does not affect other chains", () => {
      process.env[ENV_KEY] = "https://custom-rpc.example/base";
      const config = getChainConfig(1);
      expect(config?.rpcUrls).not.toContain("https://custom-rpc.example/base");
    });

    it("falls back to defaults when unset", () => {
      const config = getChainConfig(8453);
      expect(config?.rpcUrls[0]).toBe("https://mainnet.base.org");
    });
  });
});
