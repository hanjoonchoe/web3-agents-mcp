import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPublicClient, resetClientPool } from "../../src/chains/clients.js";
import { isOk } from "../../src/shared/result.js";

const ENV_KEY = "RPC_URL_8453";
const originalEnvValue = process.env[ENV_KEY];

describe("getPublicClient", () => {
  beforeEach(() => {
    resetClientPool();
  });

  afterEach(() => {
    resetClientPool();
    if (originalEnvValue === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnvValue;
    }
  });

  it("T-1: returns ok for chainId 1", () => {
    const result = getPublicClient(1);
    expect(isOk(result)).toBe(true);
  });

  it("T-1: returns ok for chainId 8453", () => {
    const result = getPublicClient(8453);
    expect(isOk(result)).toBe(true);
  });

  it("T-1: returns CHAIN_UNSUPPORTED for an unknown chainId", () => {
    const result = getPublicClient(999999);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CHAIN_UNSUPPORTED");
      expect(result.error.retryable).toBe(false);
    }
  });

  it("T-2: returns the identical client instance for the same chainId", () => {
    const first = getPublicClient(1);
    const second = getPublicClient(1);
    expect(isOk(first)).toBe(true);
    expect(isOk(second)).toBe(true);
    if (isOk(first) && isOk(second)) {
      expect(first.value).toBe(second.value);
    }
  });

  it("T-2: returns distinct clients for distinct chainIds", () => {
    const ethereum = getPublicClient(1);
    const base = getPublicClient(8453);
    if (isOk(ethereum) && isOk(base)) {
      expect(ethereum.value).not.toBe(base.value);
    }
  });

  it("T-3: RPC_URL_8453 env override is first in the transport list", () => {
    process.env[ENV_KEY] = "https://custom-rpc.example/base";
    resetClientPool();
    const result = getPublicClient(8453);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      // viem's fallback() transport, once instantiated on a client, exposes the
      // ordered list of underlying transports it will try under `.transport.transports`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transports = (result.value.transport as any).transports as Array<{
        value?: { url?: string };
      }>;
      expect(transports[0]?.value?.url).toBe("https://custom-rpc.example/base");
    }
  });
});
