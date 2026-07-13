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

type Envelope<T> = { ok: true; data: T } | { ok: false; error: Omit<BridgeError, "cause"> };

function toEnvelope<T>(result: Result<T>): Envelope<T> {
  if (result.ok) {
    return { ok: true, data: result.value };
  }
  const { code, message, retryable } = result.error;
  return { ok: false, error: { code, message, retryable } };
}

function toCallToolResult<T>(result: Result<T>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(toEnvelope(result)) }],
  };
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
}
