import { afterEach, describe, expect, it } from "vitest";
import { supportedChainIds, supportedSlugs } from "../../src/chains/config.js";
import { listChains, listChainsOutputSchema } from "../../src/tools/list-chains.js";
import { isOk } from "../../src/shared/result.js";

const ENV_KEY = "DEFAULT_CHAIN_ID";
const originalEnvValue = process.env[ENV_KEY];

describe("list_chains tool", () => {
  afterEach(() => {
    if (originalEnvValue === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnvValue;
    }
  });

  it("lists every configured chain, including the 5 new ones", () => {
    const result = listChains();
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const chainIds = result.value.chains.map((c) => c.chainId).sort((a, b) => a - b);
    expect(chainIds).toEqual(supportedChainIds().sort((a, b) => a - b));

    const slugs = result.value.chains.map((c) => c.chain).sort();
    expect(slugs).toEqual(supportedSlugs().sort());

    for (const slug of ["polygon", "arbitrum", "optimism", "bnb", "gnosis"]) {
      expect(slugs).toContain(slug);
    }
  });

  it("each entry has non-empty registries and a rpcOverrideEnv matching RPC_URL_<chainId>", () => {
    const result = listChains();
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    for (const chain of result.value.chains) {
      expect(chain.registries.identity).toMatch(/^0x/);
      expect(chain.registries.reputation).toMatch(/^0x/);
      expect(chain.registries.validation).toMatch(/^0x/);
      expect(chain.rpcOverrideEnv).toBe(`RPC_URL_${chain.chainId}`);
    }
  });

  it("isDefault follows the DEFAULT_CHAIN_ID env var", () => {
    delete process.env[ENV_KEY];
    const defaultResult = listChains();
    expect(isOk(defaultResult)).toBe(true);
    if (!isOk(defaultResult)) return;
    expect(defaultResult.value.defaultChainId).toBe(8453);
    const defaultEntries = defaultResult.value.chains.filter((c) => c.isDefault);
    expect(defaultEntries).toHaveLength(1);
    expect(defaultEntries[0]?.chainId).toBe(8453);

    process.env[ENV_KEY] = "137";
    const polygonResult = listChains();
    expect(isOk(polygonResult)).toBe(true);
    if (!isOk(polygonResult)) return;
    expect(polygonResult.value.defaultChainId).toBe(137);
    const polygonDefaultEntries = polygonResult.value.chains.filter((c) => c.isDefault);
    expect(polygonDefaultEntries).toHaveLength(1);
    expect(polygonDefaultEntries[0]?.chainId).toBe(137);
  });

  it("no configured chain is marked isDefault when DEFAULT_CHAIN_ID points at an unconfigured id", () => {
    process.env[ENV_KEY] = "999999";
    const result = listChains();
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.defaultChainId).toBe(999999);
    expect(result.value.chains.every((c) => !c.isDefault)).toBe(true);
  });

  it("output conforms to the exported zod output schema", () => {
    const result = listChains();
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(() => listChainsOutputSchema.parse(result.value)).not.toThrow();
  });
});
