import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Abi,
  type Address,
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeErrorResult,
  encodeFunctionResult,
} from "viem";
import { base } from "viem/chains";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isOk } from "../../src/shared/result.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const identityAbi = JSON.parse(
  readFileSync(path.join(here, "../../src/registry/abi/identity.json"), "utf8"),
) as Abi;
const reputationAbi = JSON.parse(
  readFileSync(path.join(here, "../../src/registry/abi/reputation.json"), "utf8"),
) as Abi;

const IDENTITY_ADDRESS: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const REPUTATION_ADDRESS: Address = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";
const OWNER: Address = "0x00000000000000000000000000000000000000AA";
const CLIENT_A: Address = "0x0000000000000000000000000000000000000001";
const CLIENT_B: Address = "0x0000000000000000000000000000000000000002";

const NOT_FOUND_ID = 999_999_999n;
const RPC_FAILURE_ID = 888_888_888n;
const HAPPY_ID = 1n;
const ZERO_FEEDBACK_ID = 2n;
const LOW_VOLUME_ID = 3n;
const REPUTATION_RPC_FAILURE_ID = 4n;

function encodeIdentityCall(data: `0x${string}`): { success: boolean; data: `0x${string}` } {
  const decoded = decodeFunctionData({ abi: identityAbi, data });
  const agentId = decoded.args?.[0] as bigint;

  if (agentId === RPC_FAILURE_ID) {
    throw new Error("simulated network failure");
  }
  if (agentId === NOT_FOUND_ID) {
    return {
      success: false,
      data: encodeErrorResult({
        abi: identityAbi,
        errorName: "ERC721NonexistentToken",
        args: [agentId],
      }),
    };
  }
  if (decoded.functionName === "ownerOf") {
    return {
      success: true,
      data: encodeFunctionResult({ abi: identityAbi, functionName: "ownerOf", result: OWNER }),
    };
  }
  return {
    success: true,
    data: encodeFunctionResult({
      abi: identityAbi,
      functionName: "tokenURI",
      result: `ipfs://agent-${agentId.toString()}`,
    }),
  };
}

function encodeReputationCall(data: `0x${string}`): { success: boolean; data: `0x${string}` } {
  const decoded = decodeFunctionData({ abi: reputationAbi, data });
  const agentId = decoded.args?.[0] as bigint;

  if (decoded.functionName === "getClients") {
    if (agentId === REPUTATION_RPC_FAILURE_ID) {
      throw new Error("simulated reputation rpc failure");
    }
    if (agentId === ZERO_FEEDBACK_ID) {
      return {
        success: true,
        data: encodeFunctionResult({ abi: reputationAbi, functionName: "getClients", result: [] }),
      };
    }
    if (agentId === LOW_VOLUME_ID) {
      return {
        success: true,
        data: encodeFunctionResult({
          abi: reputationAbi,
          functionName: "getClients",
          result: [CLIENT_A],
        }),
      };
    }
    return {
      success: true,
      data: encodeFunctionResult({
        abi: reputationAbi,
        functionName: "getClients",
        result: [CLIENT_A, CLIENT_B],
      }),
    };
  }

  if (decoded.functionName === "getSummary") {
    if (agentId === LOW_VOLUME_ID) {
      return {
        success: true,
        data: encodeFunctionResult({
          abi: reputationAbi,
          functionName: "getSummary",
          result: [3n, 90n, 0],
        }),
      };
    }
    // HAPPY_ID: 10 entries, average score 85 (decimals 0)
    return {
      success: true,
      data: encodeFunctionResult({
        abi: reputationAbi,
        functionName: "getSummary",
        result: [10n, 85n, 0],
      }),
    };
  }

  if (decoded.functionName === "readAllFeedback") {
    return {
      success: true,
      data: encodeFunctionResult({
        abi: reputationAbi,
        functionName: "readAllFeedback",
        result: [
          [CLIENT_A, CLIENT_A, CLIENT_B],
          [1n, 2n, 1n],
          [80n, 90n, 70n],
          [0, 0, 0],
          ["good", "great", ""],
          ["", "", ""],
          [false, false, false],
        ],
      }),
    };
  }

  throw new Error(`unexpected reputation function in mock: ${decoded.functionName}`);
}

type CallLogEntry = { to: string; data: string };

function buildMockClient(callLog: CallLogEntry[]) {
  const transport = custom({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request: async ({ method, params }: { method: string; params: any }) => {
      if (method === "eth_chainId") return "0x2105";
      if (method === "eth_blockNumber") return "0x1";
      if (method === "eth_getLogs") return [];
      if (method === "eth_call") {
        const [{ to, data }] = params as [{ to: Address; data: `0x${string}` }];
        callLog.push({ to, data });

        if (to.toLowerCase() === IDENTITY_ADDRESS.toLowerCase()) {
          const { success, data: resultData } = encodeIdentityCall(data);
          if (!success) {
            throw Object.assign(new Error("execution reverted"), { code: 3, data: resultData });
          }
          return resultData;
        }
        if (to.toLowerCase() === REPUTATION_ADDRESS.toLowerCase()) {
          const { data: resultData } = encodeReputationCall(data);
          return resultData;
        }
        throw new Error(`unexpected eth_call target in mock: ${to}`);
      }
      throw new Error(`unexpected RPC method in mock transport: ${method}`);
    },
    retryCount: 0,
  });

  return createPublicClient({ chain: base, transport, pollingInterval: 1 });
}

let mockCallLog: CallLogEntry[] = [];
let mockClient: ReturnType<typeof buildMockClient>;

vi.mock("../../src/chains/clients.js", () => ({
  getPublicClient: () => ({ ok: true, value: mockClient }),
}));

vi.mock("../../src/chains/config.js", () => ({
  getChainConfig: (chainId: number) =>
    chainId === 8453
      ? {
          chainId: 8453,
          name: "base",
          rpcUrls: ["http://mock"],
          registries: {
            identity: IDENTITY_ADDRESS,
            reputation: REPUTATION_ADDRESS,
            validation: REPUTATION_ADDRESS,
          },
          deploymentBlock: 0n,
        }
      : undefined,
}));

const { getSummary, readFeedback } = await import("../../src/registry/reputation.js");

describe("reputation registry reads (mocked transport)", () => {
  beforeEach(() => {
    mockCallLog = [];
    mockClient = buildMockClient(mockCallLog);
  });

  it("T-1: getSummary happy path decodes count/average from mocked reads", async () => {
    const result = await getSummary(8453, HAPPY_ID);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.count).toBe(10n);
      expect(result.value.averageScore).toBe(85);
      expect(result.value.lastFeedbackAt).toBeNull();
    }
  });

  it("T-2: zero-feedback agent -> count 0, averageScore null, ok:true (no getSummary call needed)", async () => {
    const result = await getSummary(8453, ZERO_FEEDBACK_ID);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.count).toBe(0n);
      expect(result.value.averageScore).toBeNull();
      expect(result.value.lastFeedbackAt).toBeNull();
    }
  });

  it("T-3: low-volume agent (count < 5) still decodes correctly at the registry layer", async () => {
    const result = await getSummary(8453, LOW_VOLUME_ID);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.count).toBe(3n);
      expect(result.value.averageScore).toBe(90);
    }
  });

  it("T-6: unregistered agentId -> AGENT_NOT_FOUND", async () => {
    const result = await getSummary(8453, NOT_FOUND_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AGENT_NOT_FOUND");
    }
  });

  it("getSummary maps an identity RPC failure to RPC_ERROR", async () => {
    const result = await getSummary(8453, RPC_FAILURE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RPC_ERROR");
      expect(result.error.retryable).toBe(true);
    }
  });

  it("getSummary maps a reputation-contract RPC failure to RPC_ERROR", async () => {
    const result = await getSummary(8453, REPUTATION_RPC_FAILURE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RPC_ERROR");
      expect(result.error.retryable).toBe(true);
      expect(result.error.cause).toBeDefined();
    }
  });

  it("readFeedback decodes all entries via readAllFeedback and paginates client-side", async () => {
    const result = await readFeedback(8453, HAPPY_ID, { limit: 2, offset: 1 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]?.client.toLowerCase()).toBe(CLIENT_A.toLowerCase());
      expect(result.value[0]?.score).toBe(90);
      expect(result.value[0]?.tag).toBe("great");
      expect(result.value[0]?.uri).toBeNull();
      expect(result.value[0]?.timestamp).toBeNull();
      expect(result.value[1]?.client.toLowerCase()).toBe(CLIENT_B.toLowerCase());
      expect(result.value[1]?.tag).toBeNull(); // empty tag1 -> null
    }
  });

  it("readFeedback offset beyond total returns an empty array (ok:true)", async () => {
    const result = await readFeedback(8453, HAPPY_ID, { limit: 50, offset: 100 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual([]);
    }
  });

  it("T-11: readFeedback clamps limit at 200 internally", async () => {
    const result = await readFeedback(8453, HAPPY_ID, { limit: 10_000, offset: 0 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      // Only 3 entries exist regardless — this proves the huge limit didn't error/misbehave.
      expect(result.value).toHaveLength(3);
    }
  });

  it("readFeedback on an unregistered agentId -> AGENT_NOT_FOUND", async () => {
    const result = await readFeedback(8453, NOT_FOUND_ID, { limit: 10, offset: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AGENT_NOT_FOUND");
    }
  });
});
