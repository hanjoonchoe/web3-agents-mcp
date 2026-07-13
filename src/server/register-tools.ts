import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Result } from "../shared/result.js";
import type { BridgeError } from "../shared/errors.js";
import { ping } from "../tools/ping.js";
import { resolveAgent, resolveAgentInputShape } from "../tools/resolve-agent.js";
import {
  getRegistrationFile,
  getRegistrationFileInputShape,
} from "../tools/get-registration-file.js";
import { GetReputationInput, getReputation } from "../tools/get-reputation.js";
import { GetValidationsInput, getValidations } from "../tools/get-validations.js";
import { assessTrust, assessTrustInputShape } from "../tools/assess-trust.js";

type Envelope<T> = { ok: true; data: T } | { ok: false; error: Omit<BridgeError, "cause"> };

// Upstream libraries (viem especially) can produce multi-KB, multi-line error
// messages — including entire embedded HTML error pages from failing RPCs. MCP tool
// consumers are LLMs, so the serialized envelope keeps only the first line, capped
// at MAX_ERROR_MESSAGE_CHARS. The full original message remains available internally
// on the BridgeError (and its `cause`), which is never serialized into the envelope.
const MAX_ERROR_MESSAGE_CHARS = 300;
const TRUNCATION_MARKER = "… [truncated]";

function sanitizeErrorMessage(message: string): string {
  const newlineIndex = message.search(/\r|\n/);
  const firstLine = newlineIndex === -1 ? message : message.slice(0, newlineIndex);
  // The marker counts toward the cap so the serialized message never exceeds it.
  const capped =
    firstLine.length > MAX_ERROR_MESSAGE_CHARS
      ? firstLine.slice(0, MAX_ERROR_MESSAGE_CHARS - TRUNCATION_MARKER.length)
      : firstLine;
  return capped.length < message.length ? capped + TRUNCATION_MARKER : capped;
}

/** Exported for tests only; not part of the tool surface. */
export function toEnvelope<T>(result: Result<T>): Envelope<T> {
  if (result.ok) {
    return { ok: true, data: result.value };
  }
  const { code, message, retryable } = result.error;
  return { ok: false, error: { code, message: sanitizeErrorMessage(message), retryable } };
}

function toCallToolResult<T>(result: Result<T>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(toEnvelope(result)) }],
  };
}

async function toCallToolResultAsync<T>(result: Promise<Result<T>>): Promise<CallToolResult> {
  return toCallToolResult(await result);
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "ping",
    {
      description: "Liveness check; returns pong and the server version.",
    },
    () => toCallToolResult(ping()),
  );

  server.registerTool(
    "resolve_agent",
    {
      description:
        "Resolves an ERC-8004 agent by agentId or ownerAddress (exactly one selector), " +
        "returning identity fields plus best-effort endpoints/capabilities parsed from " +
        "its registration file.",
      inputSchema: resolveAgentInputShape,
    },
    async (input) => toCallToolResult(await resolveAgent(input)),
  );

  server.registerTool(
    "get_registration_file",
    {
      description:
        "Fetches and verifies an agent's registration file (via its tokenUri): " +
        "ipfs:// CIDs are verified, data: URIs are inherently verified, https:// is " +
        "unverifiable in v1 (no on-chain hash commitment).",
      inputSchema: getRegistrationFileInputShape,
    },
    async (input) => toCallToolResult(await getRegistrationFile(input)),
  );

  server.registerTool(
    "get_reputation",
    {
      description:
        "Reads an agent's Reputation Registry feedback summary (and optionally the raw " +
        "feedback entries). Always returns honesty caveats — feedback is self-reported " +
        "by clients and is a weak signal, especially for low feedback counts.",
      inputSchema: GetReputationInput.shape,
    },
    (args) => toCallToolResultAsync(getReputation(args)),
  );

  server.registerTool(
    "get_validations",
    {
      description:
        "Reads an agent's Validation Registry entries (validator, best-effort method " +
        "classification, response, timestamp). An agent with zero validations is a " +
        "normal, successful result — not an error.",
      inputSchema: GetValidationsInput.shape,
    },
    (args) => toCallToolResultAsync(getValidations(args)),
  );

  server.registerTool(
    "assess_trust",
    {
      description:
        "Factual trust report for an ERC-8004 agent: runs identity, registration " +
        "file, reputation, and validation lookups in parallel with graceful partial " +
        "failure, and returns the raw sections plus deterministic honesty caveats " +
        "and a short factual natural-language summary. No numeric scoring. " +
        "`taskContext` only shapes the summary text.",
      inputSchema: assessTrustInputShape,
    },
    async (input) => toCallToolResult(await assessTrust(input)),
  );
}
