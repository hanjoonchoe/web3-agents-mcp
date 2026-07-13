import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Abi,
  type Address,
  type Hex,
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
const validationAbi = JSON.parse(
  readFileSync(path.join(here, "../../src/registry/abi/validation.json"), "utf8"),
) as Abi;

const IDENTITY_ADDRESS: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const VALIDATION_ADDRESS: Address = "0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58";
const MULTICALL_ADDRESS: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";
const OWNER: Address = "0x00000000000000000000000000000000000000AA";
const VALIDATOR_A: Address = "0x0000000000000000000000000000000000000003";
const VALIDATOR_B: Address = "0x0000000000000000000000000000000000000004";

const NOT_FOUND_ID = 999_999_999n;
const HAPPY_ID = 1n;
const ZERO_ID = 2n;
const MULTICALL_FAILURE_ID = 3n;

const HASH_A: Hex = `0x${"a".repeat(64)}`;
const HASH_B: Hex = `0x${"b".repeat(64)}`;
const HASH_C: Hex = `0x${"c".repeat(64)}`;
const HASH_D: Hex = `0x${"d".repeat(64)}`;

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

function encodeIdentityCall(data: `0x${string}`): { success: boolean; data: `0x${string}` } {
  const decoded = decodeFunctionData({ abi: identityAbi, data });
  const agentId = decoded.args?.[0] as bigint;

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

// agentId -> requestHash[]
const AGENT_VALIDATIONS: Record<string, Hex[]> = {
  [HAPPY_ID.toString()]: [HASH_A, HASH_B, HASH_C, HASH_D],
  [ZERO_ID.toString()]: [],
  [MULTICALL_FAILURE_ID.toString()]: [HASH_A],
};

// requestHash -> ValidationStatus tuple fixture
const STATUS_BY_HASH: Record<
  string,
  { validator: Address; response: number; tag: string; lastUpdate: bigint }
> = {
  [HASH_A]: { validator: VALIDATOR_A, response: 0, tag: "tee", lastUpdate: 1_700_000_000n },
  [HASH_B]: { validator: VALIDATOR_B, response: 100, tag: "ZK", lastUpdate: 1_700_000_100n },
  [HASH_C]: {
    validator: VALIDATOR_A,
    response: 55,
    tag: "some-other-tag",
    lastUpdate: 1_700_000_200n,
  },
  [HASH_D]: { validator: VALIDATOR_B, response: 42, tag: "", lastUpdate: 1_700_000_300n },
};

function encodeValidationCall(data: `0x${string}`): { success: boolean; data: `0x${string}` } {
  const decoded = decodeFunctionData({ abi: validationAbi, data });

  if (decoded.functionName === "getAgentValidations") {
    const agentId = decoded.args?.[0] as bigint;
    const hashes = AGENT_VALIDATIONS[agentId.toString()] ?? [];
    return {
      success: true,
      data: encodeFunctionResult({
        abi: validationAbi,
        functionName: "getAgentValidations",
        result: hashes,
      }),
    };
  }

  if (decoded.functionName === "getValidationStatus") {
    const hash = decoded.args?.[0] as Hex;
    const fixture = STATUS_BY_HASH[hash];
    if (!fixture) {
      throw new Error(`no fixture for hash ${hash}`);
    }
    return {
      success: true,
      data: encodeFunctionResult({
        abi: validationAbi,
        functionName: "getValidationStatus",
        result: [
          fixture.validator,
          HAPPY_ID,
          fixture.response,
          `0x${"0".repeat(64)}` as Hex,
          fixture.tag,
          fixture.lastUpdate,
        ],
      }),
    };
  }

  throw new Error(`unexpected validation function in mock: ${decoded.functionName}`);
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

        if (to.toLowerCase() === MULTICALL_ADDRESS.toLowerCase()) {
          const decoded = decodeFunctionData({ abi: multicall3Abi, data });
          const calls = decoded.args[0];
          const returnData = calls.map((call) => {
            try {
              const decodedCall = decodeFunctionData({ abi: validationAbi, data: call.callData });
              const hash = decodedCall.args?.[0] as Hex;
              if (
                decodedCall.functionName === "getValidationStatus" &&
                hash === HASH_A &&
                multicallShouldFail
              ) {
                return { success: false, returnData: "0x" as const };
              }
              const { success, data: resultData } = encodeValidationCall(call.callData);
              return { success, returnData: resultData };
            } catch {
              return { success: false, returnData: "0x" as const };
            }
          });
          return encodeFunctionResult({
            abi: multicall3Abi,
            functionName: "aggregate3",
            result: returnData,
          });
        }

        if (to.toLowerCase() === VALIDATION_ADDRESS.toLowerCase()) {
          const { data: resultData } = encodeValidationCall(data);
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
let multicallShouldFail = false;

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
            reputation: VALIDATION_ADDRESS,
            validation: VALIDATION_ADDRESS,
          },
          deploymentBlock: 0n,
        }
      : undefined,
}));

const { getValidations } = await import("../../src/registry/validation.js");

describe("validation registry reads (mocked transport)", () => {
  beforeEach(() => {
    mockCallLog = [];
    multicallShouldFail = false;
    mockClient = buildMockClient(mockCallLog);
  });

  it("T-7: happy path decodes validator/method/requestHash/response/timestamp; unknown tag -> other", async () => {
    const result = await getValidations(8453, HAPPY_ID, { limit: 50, offset: 0 });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    expect(result.value.total).toBe(4);
    const [a, b, c, d] = result.value.entries;

    expect(a?.method).toBe("tee");
    expect(a?.requestHash).toBe(HASH_A);
    expect(a?.validator.toLowerCase()).toBe(VALIDATOR_A.toLowerCase());
    expect(a?.timestamp).toBe(1_700_000_000n);

    expect(b?.method).toBe("zk"); // case-insensitive match on "ZK"
    expect(c?.method).toBe("other"); // unrecognized tag -> other, never guessed
    expect(d?.method).toBe("other"); // empty tag -> other
  });

  it("T-8: zero validations -> entries [], total 0, ok:true", async () => {
    const result = await getValidations(8453, ZERO_ID, { limit: 50, offset: 0 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.entries).toEqual([]);
      expect(result.value.total).toBe(0);
    }
  });

  it("T-9: response scale bounds — 0 and 100 pass through unchanged", async () => {
    const result = await getValidations(8453, HAPPY_ID, { limit: 50, offset: 0 });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.entries[0]?.response).toBe(0);
    expect(result.value.entries[1]?.response).toBe(100);
  });

  it("paginates the request-hash list before fetching per-hash detail", async () => {
    const result = await getValidations(8453, HAPPY_ID, { limit: 2, offset: 1 });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.total).toBe(4);
    expect(result.value.entries).toHaveLength(2);
    expect(result.value.entries[0]?.requestHash).toBe(HASH_B);
    expect(result.value.entries[1]?.requestHash).toBe(HASH_C);
  });

  it("T-11: limit clamped at 200 internally", async () => {
    const result = await getValidations(8453, HAPPY_ID, { limit: 10_000, offset: 0 });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.entries).toHaveLength(4);
    }
  });

  it("T-6: unregistered agentId -> AGENT_NOT_FOUND", async () => {
    const result = await getValidations(8453, NOT_FOUND_ID, { limit: 50, offset: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AGENT_NOT_FOUND");
    }
  });

  it("maps a multicall per-item failure to RPC_ERROR", async () => {
    multicallShouldFail = true;
    const result = await getValidations(8453, MULTICALL_FAILURE_ID, { limit: 50, offset: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RPC_ERROR");
      expect(result.error.retryable).toBe(true);
    }
  });
});
