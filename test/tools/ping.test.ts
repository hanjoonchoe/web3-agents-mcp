import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerTools } from "../../src/server/register-tools.js";
import { ping } from "../../src/tools/ping.js";

const SEMVER_RE = /^\d+\.\d+\.\d+/;

describe("ping tool", () => {
  it("core ping() returns ok result with pong:true and a semver version", () => {
    const result = ping();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pong).toBe(true);
      expect(result.value.version).toMatch(SEMVER_RE);
    }
  });

  it("returns the exact success envelope shape over the MCP protocol", async () => {
    const server = new McpServer({ name: "test-server", version: "0.0.0" });
    registerTools(server);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const response = await client.callTool({ name: "ping", arguments: {} });
    const content = response.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe("text");

    const envelope = JSON.parse(content[0]?.text ?? "");
    expect(envelope).toEqual({
      ok: true,
      data: {
        pong: true,
        version: expect.stringMatching(SEMVER_RE),
      },
    });

    await client.close();
    await server.close();
  });
});
