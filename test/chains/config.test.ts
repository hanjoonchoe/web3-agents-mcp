import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getChainConfig, supportedChainIds } from "../../src/chains/config.js";

const ENV_KEY = "RPC_URL_8453";
const originalEnvValue = process.env[ENV_KEY];

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
    expect(config?.rpcUrls.length).toBeGreaterThan(0);
    expect(config?.registries.identity).toMatch(/^0x/);
    expect(config?.deploymentBlock).toBe(24339871n);
  });

  it("returns a config for Base (8453)", () => {
    const config = getChainConfig(8453);
    expect(config).toBeDefined();
    expect(config?.chainId).toBe(8453);
    expect(config?.name).toBe("base");
    expect(config?.deploymentBlock).toBe(41663783n);
  });

  it("returns undefined for an unsupported chainId", () => {
    expect(getChainConfig(999999)).toBeUndefined();
  });

  it("uses the same registry addresses on both configured mainnet chains", () => {
    const ethereum = getChainConfig(1);
    const base = getChainConfig(8453);
    expect(ethereum?.registries).toEqual(base?.registries);
  });

  it("lists exactly the supported chainIds", () => {
    expect(supportedChainIds().sort()).toEqual([1, 8453]);
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
