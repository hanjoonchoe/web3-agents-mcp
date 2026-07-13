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

const IDENTITY_ADDRESS: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const MULTICALL_ADDRESS: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";
const OWNER: Address = "0x00000000000000000000000000000000000000AA";
const NOT_FOUND_ID = 999_999_999n;
const RPC_FAILURE_ID = 888_888_888n;

const multicall3Abi = [
  {
    type: "function",
    name: "aggregate3",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
] as const;

function tokenUriFor(agentId: bigint): string {
  return `ipfs://agent-${agentId.toString()}`;
}

// Encodes the eth_call response for a single ownerOf/tokenURI call against the
// Identity Registry, simulating real contract behavior for the fixed test fixtures.
function encodeIdentityCall(callData: `0x${string}`): { success: boolean; data: `0x${string}` } {
  if (callData === "0x__RPC_FAILURE__") {
    throw new Error("should not happen");
  }
  const decoded = decodeFunctionData({ abi: identityAbi, data: callData });
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
      result: tokenUriFor(agentId),
    }),
  };
}

type CallLogEntry = { to: string; data: string };

function buildMockClient(callLog: CallLogEntry[]) {
  const transport = custom({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request: async ({ method, params }: { method: string; params: any }) => {
      if (method === "eth_chainId") {
        return "0x2105";
      }
      if (method === "eth_blockNumber") {
        return "0x1";
      }
      if (method === "eth_getLogs") {
        return [];
      }
      if (method === "eth_call") {
        const [{ to, data }] = params as [{ to: Address; data: `0x${string}` }];
        callLog.push({ to, data });

        if (to.toLowerCase() === MULTICALL_ADDRESS.toLowerCase()) {
          const decoded = decodeFunctionData({ abi: multicall3Abi, data });
          const calls = decoded.args[0];
          const returnData = calls.map((call) => {
            try {
              const { success, data: resultData } = encodeIdentityCall(call.callData);
              return { success, returnData: resultData };
            } catch {
              // Non-revert failure inside a batched call still surfaces as success:false
              // with empty returnData in real multicall3 behavior when allowFailure=true
              // is combined with an out-of-gas/panic; here we simply mark it failed.
              return { success: false, returnData: "0x" as const };
            }
          });
          return encodeFunctionResult({
            abi: multicall3Abi,
            functionName: "aggregate3",
            result: returnData,
          });
        }

        const { success, data: resultData } = encodeIdentityCall(data);
        if (!success) {
          // Simulate a JSON-RPC revert error the way real nodes report it.
          throw Object.assign(new Error("execution reverted"), {
            code: 3,
            data: resultData,
          });
        }
        return resultData;
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
            reputation: IDENTITY_ADDRESS,
            validation: IDENTITY_ADDRESS,
          },
          deploymentBlock: 0n,
        }
      : undefined,
}));

const { getAgent, getAgentBatch, getAgentsByOwner, resolveByDomain } =
  await import("../../src/registry/identity.js");

describe("identity registry reads (mocked transport)", () => {
  beforeEach(() => {
    mockCallLog = [];
    mockClient = buildMockClient(mockCallLog);
  });

  it("T-4: getAgent happy path decodes owner/tokenUri from mocked responses", async () => {
    const result = await getAgent(8453, 1n);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.agentId).toBe(1n);
      expect(result.value.owner.toLowerCase()).toBe(OWNER.toLowerCase());
      expect(result.value.tokenUri).toBe(tokenUriFor(1n));
      expect(result.value.registeredAt).toBeNull();
    }
  });

  it("T-5: getAgent on a nonexistent id returns AGENT_NOT_FOUND", async () => {
    const result = await getAgent(8453, NOT_FOUND_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AGENT_NOT_FOUND");
      expect(result.error.retryable).toBe(false);
    }
  });

  it("T-6: getAgent maps a transport failure to RPC_ERROR with retryable:true and cause set", async () => {
    const result = await getAgent(8453, RPC_FAILURE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RPC_ERROR");
      expect(result.error.retryable).toBe(true);
      expect(result.error.cause).toBeDefined();
    }
  });

  it("T-7: getAgentBatch issues a single multicall, preserves order, isolates per-item failures", async () => {
    const ids = [1n, NOT_FOUND_ID, 2n];
    const result = await getAgentBatch(8453, ids);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const ethCalls = mockCallLog.filter(() => true);
    expect(ethCalls.length).toBe(1);
    expect(ethCalls[0]?.to.toLowerCase()).toBe(MULTICALL_ADDRESS.toLowerCase());

    expect(result.value).toHaveLength(3);
    const [first, second, third] = result.value;

    expect(first?.ok).toBe(true);
    if (first?.ok) {
      expect(first.value.agentId).toBe(1n);
    }

    expect(second?.ok).toBe(false);
    if (second && !second.ok) {
      expect(second.error.code).toBe("AGENT_NOT_FOUND");
    }

    expect(third?.ok).toBe(true);
    if (third?.ok) {
      expect(third.value.agentId).toBe(2n);
    }
  });

  it("getAgentBatch returns an empty array for an empty input without any RPC calls", async () => {
    const result = await getAgentBatch(8453, []);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual([]);
    }
    expect(mockCallLog.length).toBe(0);
  });

  it("resolveByDomain always resolves to null (no on-chain mechanism in v1)", async () => {
    const result = await resolveByDomain(8453, "example.eth");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBeNull();
    }
  });

  it("getAgentsByOwner returns an empty list when no Transfer logs match", async () => {
    const result = await getAgentsByOwner(8453, OWNER);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual([]);
    }
  });
});
