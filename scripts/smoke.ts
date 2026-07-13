import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/server/index.js"],
  });
  const client = new Client({ name: "smoke-client", version: "0.0.0" });
  await client.connect(transport);

  const response = await client.callTool({ name: "ping", arguments: {} });
  process.stdout.write(JSON.stringify(response, null, 2) + "\n");

  await client.close();
}

main().catch((error: unknown) => {
  process.stderr.write(`smoke test failed: ${String(error)}\n`);
  process.exitCode = 1;
});
