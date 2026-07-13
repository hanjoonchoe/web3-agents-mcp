import { beforeEach, describe, expect, it, vi } from "vitest";
import { bridgeError } from "../../src/shared/errors.js";
import { err, isOk, ok } from "../../src/shared/result.js";

const OWNER = "0x00000000000000000000000000000000000000AA"
  .toLowerCase()
  .slice(0, 42) as `0x${string}`;

const getAgentMock = vi.fn();
const getAgentsByOwnerMock = vi.fn();
const fetchRegistrationFileMock = vi.fn();

vi.mock("../../src/registry/identity.js", () => ({
  getAgent: (...args: unknown[]) => getAgentMock(...args),
  getAgentsByOwner: (...args: unknown[]) => getAgentsByOwnerMock(...args),
}));

vi.mock("../../src/fetcher/fetch.js", () => ({
  fetchRegistrationFile: (...args: unknown[]) => fetchRegistrationFileMock(...args),
}));

const { resolveAgent, resolveAgentOutputSchema } = await import("../../src/tools/resolve-agent.js");

describe("resolve_agent", () => {
  beforeEach(() => {
    getAgentMock.mockReset();
    getAgentsByOwnerMock.mockReset();
    fetchRegistrationFileMock.mockReset();
  });

  it("T-8a: zero selectors -> INVALID_INPUT naming the rule", async () => {
    const result = await resolveAgent({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
      expect(result.error.message).toMatch(/exactly one of/i);
    }
  });

  it("T-8b: both selectors -> INVALID_INPUT naming the rule", async () => {
    const result = await resolveAgent({ agentId: "1", ownerAddress: OWNER });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
      expect(result.error.message).toMatch(/exactly one of/i);
    }
  });

  it("T-9: agentId happy path derives endpoints/capabilities from the registration file", async () => {
    getAgentMock.mockResolvedValue(
      ok({ agentId: 1n, owner: OWNER, tokenUri: "ipfs://cid123", registeredAt: 1_700_000_000n }),
    );
    fetchRegistrationFileMock.mockResolvedValue(
      ok({
        content: {
          name: "test agent",
          services: [{ type: "http", url: "https://svc.example.com" }],
          supportedTrust: ["reputation"],
        },
        raw: new Uint8Array(),
        verified: true,
        source: "ipfs",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        hashComputed: "0xabc",
        contentError: null,
      }),
    );

    const result = await resolveAgent({ agentId: "1", chain: "base" });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.agentId).toBe("1");
      expect(result.value.owner).toBe(OWNER);
      expect(result.value.tokenUri).toBe("ipfs://cid123");
      expect(result.value.endpoints).toEqual(["https://svc.example.com"]);
      expect(result.value.capabilities).toEqual(["reputation"]);
      expect(result.value.registeredAt).toBe("1700000000");
    }
  });

  it("T-9b: file fetch failure still returns identity fields, with endpoints/capabilities null", async () => {
    getAgentMock.mockResolvedValue(
      ok({
        agentId: 2n,
        owner: OWNER,
        tokenUri: "https://example.com/agent.json",
        registeredAt: null,
      }),
    );
    fetchRegistrationFileMock.mockResolvedValue(
      err(bridgeError("FILE_UNREACHABLE", "boom", { retryable: true })),
    );

    const result = await resolveAgent({ agentId: "2", chain: "base" });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.agentId).toBe("2");
      expect(result.value.tokenUri).toBe("https://example.com/agent.json");
      expect(result.value.endpoints).toBeNull();
      expect(result.value.capabilities).toBeNull();
      expect(result.value.registeredAt).toBeNull();
    }
  });

  it("agentId path propagates AGENT_NOT_FOUND from the registry", async () => {
    getAgentMock.mockResolvedValue(err(bridgeError("AGENT_NOT_FOUND", "no such agent")));
    const result = await resolveAgent({ agentId: "999", chain: "base" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AGENT_NOT_FOUND");
    }
  });

  it("malformed agentId -> INVALID_INPUT", async () => {
    const result = await resolveAgent({ agentId: "not-a-number" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  it("malformed ownerAddress -> INVALID_INPUT", async () => {
    const result = await resolveAgent({ ownerAddress: "not-an-address" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  it("ownerAddress path: zero agents -> AGENT_NOT_FOUND", async () => {
    getAgentsByOwnerMock.mockResolvedValue(ok([]));
    const result = await resolveAgent({ ownerAddress: OWNER });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AGENT_NOT_FOUND");
    }
  });

  it("ownerAddress path: exactly one agent -> full record via getAgent", async () => {
    getAgentsByOwnerMock.mockResolvedValue(ok([5n]));
    getAgentMock.mockResolvedValue(
      ok({ agentId: 5n, owner: OWNER, tokenUri: "ipfs://cid5", registeredAt: null }),
    );
    fetchRegistrationFileMock.mockResolvedValue(
      ok({
        content: null,
        raw: new Uint8Array(),
        verified: null,
        source: "ipfs",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        hashComputed: "0xabc",
        contentError: null,
      }),
    );
    const result = await resolveAgent({ ownerAddress: OWNER });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.agentId).toBe("5");
      expect(result.value.candidates).toBeUndefined();
    }
  });

  it("ownerAddress path: 2+ agents -> candidates list with agentId null", async () => {
    getAgentsByOwnerMock.mockResolvedValue(ok([1n, 2n, 3n]));
    const result = await resolveAgent({ ownerAddress: OWNER });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.agentId).toBeNull();
      expect(result.value.candidates).toEqual(["1", "2", "3"]);
    }
    expect(getAgentMock).not.toHaveBeenCalled();
  });

  it("T-11: sample outputs validate against the exported zod output schema", async () => {
    getAgentMock.mockResolvedValue(
      ok({ agentId: 1n, owner: OWNER, tokenUri: "ipfs://cid123", registeredAt: 1_700_000_000n }),
    );
    fetchRegistrationFileMock.mockResolvedValue(
      ok({
        content: { services: [{ url: "https://svc.example.com" }] },
        raw: new Uint8Array(),
        verified: true,
        source: "ipfs",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        hashComputed: "0xabc",
        contentError: null,
      }),
    );
    const result = await resolveAgent({ agentId: "1" });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(() => resolveAgentOutputSchema.parse(result.value)).not.toThrow();
    }

    getAgentsByOwnerMock.mockResolvedValue(ok([1n, 2n]));
    const candidatesResult = await resolveAgent({ ownerAddress: OWNER });
    expect(isOk(candidatesResult)).toBe(true);
    if (isOk(candidatesResult)) {
      expect(() => resolveAgentOutputSchema.parse(candidatesResult.value)).not.toThrow();
    }
  });
});
