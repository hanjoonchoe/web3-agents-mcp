import { beforeEach, describe, expect, it, vi } from "vitest";
import { bridgeError } from "../../src/shared/errors.js";
import { err, isOk, ok } from "../../src/shared/result.js";

const getAgentMock = vi.fn();
const fetchRegistrationFileMock = vi.fn();

vi.mock("../../src/registry/identity.js", () => ({
  getAgent: (...args: unknown[]) => getAgentMock(...args),
}));

vi.mock("../../src/fetcher/fetch.js", () => ({
  fetchRegistrationFile: (...args: unknown[]) => fetchRegistrationFileMock(...args),
}));

const { getRegistrationFile, getRegistrationFileOutputSchema } =
  await import("../../src/tools/get-registration-file.js");

const OWNER = "0x00000000000000000000000000000000000000AA" as `0x${string}`;

function agentRecord(tokenUri: string) {
  return ok({ agentId: 1n, owner: OWNER, tokenUri, registeredAt: null });
}

describe("get_registration_file", () => {
  beforeEach(() => {
    getAgentMock.mockReset();
    fetchRegistrationFileMock.mockReset();
  });

  it("malformed agentId -> INVALID_INPUT", async () => {
    const result = await getRegistrationFile({ agentId: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  it("propagates AGENT_NOT_FOUND from the registry lookup", async () => {
    getAgentMock.mockResolvedValue(err(bridgeError("AGENT_NOT_FOUND", "nope")));
    const result = await getRegistrationFile({ agentId: "1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AGENT_NOT_FOUND");
    }
  });

  it("propagates a fetcher error (e.g. FILE_UNREACHABLE)", async () => {
    getAgentMock.mockResolvedValue(agentRecord("ipfs://cid"));
    fetchRegistrationFileMock.mockResolvedValue(
      err(bridgeError("FILE_UNREACHABLE", "all gateways failed", { retryable: true })),
    );
    const result = await getRegistrationFile({ agentId: "1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FILE_UNREACHABLE");
    }
  });

  it("T-10a: requireVerified:true + verified:false -> FILE_HASH_MISMATCH", async () => {
    getAgentMock.mockResolvedValue(agentRecord("ipfs://cid"));
    fetchRegistrationFileMock.mockResolvedValue(
      ok({
        content: { name: "x" },
        raw: new Uint8Array(),
        verified: false,
        source: "ipfs",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        hashComputed: "0xabc",
        contentError: null,
      }),
    );
    const result = await getRegistrationFile({ agentId: "1", requireVerified: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FILE_HASH_MISMATCH");
    }
  });

  it("T-10b: requireVerified:true + verified:null passes with a notes:['unverifiable'] field", async () => {
    getAgentMock.mockResolvedValue(agentRecord("https://example.com/agent.json"));
    fetchRegistrationFileMock.mockResolvedValue(
      ok({
        content: { name: "x" },
        raw: new Uint8Array(),
        verified: null,
        source: "https",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        hashComputed: "0xabc",
        contentError: null,
      }),
    );
    const result = await getRegistrationFile({ agentId: "1", requireVerified: true });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.verified).toBeNull();
      expect(result.value.notes).toEqual(["unverifiable"]);
    }
  });

  it("T-10c: requireVerified:false + verified:false does not error, and carries no notes", async () => {
    getAgentMock.mockResolvedValue(agentRecord("ipfs://cid"));
    fetchRegistrationFileMock.mockResolvedValue(
      ok({
        content: { name: "x" },
        raw: new Uint8Array(),
        verified: false,
        source: "ipfs",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        hashComputed: "0xabc",
        contentError: null,
      }),
    );
    const result = await getRegistrationFile({ agentId: "1" });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.verified).toBe(false);
      expect(result.value.notes).toBeUndefined();
    }
  });

  it("T-11: sample output validates against the exported zod output schema", async () => {
    getAgentMock.mockResolvedValue(agentRecord("data:application/json;base64,eyJhIjoxfQ=="));
    fetchRegistrationFileMock.mockResolvedValue(
      ok({
        content: { a: 1 },
        raw: new Uint8Array(),
        verified: true,
        source: "data",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        hashComputed: "0xabc",
        contentError: null,
      }),
    );
    const result = await getRegistrationFile({ agentId: "1" });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(() => getRegistrationFileOutputSchema.parse(result.value)).not.toThrow();
    }
  });
});
