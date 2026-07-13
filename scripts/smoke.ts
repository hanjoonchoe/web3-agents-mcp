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

  // Live WP-3 smoke: Base agent #0 (data: tokenUri) and agent #2 (https: tokenUri).
  for (const args of [
    { chainId: 8453, agentId: "0" },
    { chainId: 8453, agentId: "2" },
  ]) {
    process.stdout.write(`\n--- resolve_agent ${JSON.stringify(args)} ---\n`);
    const resolveResponse = await client.callTool({ name: "resolve_agent", arguments: args });
    process.stdout.write(JSON.stringify(resolveResponse, null, 2) + "\n");

    process.stdout.write(`\n--- get_registration_file ${JSON.stringify(args)} ---\n`);
    const fileResponse = await client.callTool({ name: "get_registration_file", arguments: args });
    process.stdout.write(JSON.stringify(fileResponse, null, 2) + "\n");
  }

  process.stdout.write("\n--- resolve_agent by ownerAddress (agent #0's owner) ---\n");
  const ownerResponse = await client.callTool({
    name: "resolve_agent",
    arguments: { chainId: 8453, ownerAddress: "0xa1DaEe3EB47f05f857aCA817523F9ff11d95bD71" },
  });
  process.stdout.write(JSON.stringify(ownerResponse, null, 2) + "\n");

  process.stdout.write("\n--- resolve_agent selector validation (zero selectors) ---\n");
  const invalidResponse = await client.callTool({ name: "resolve_agent", arguments: {} });
  process.stdout.write(JSON.stringify(invalidResponse, null, 2) + "\n");

  await client.close();
}

main().catch((error: unknown) => {
  process.stderr.write(`smoke test failed: ${String(error)}\n`);
  process.exitCode = 1;
});
