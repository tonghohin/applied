import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";

const require = createRequire(import.meta.url);
const playwrightMcpCli = join(dirname(require.resolve("@playwright/mcp/package.json")), "cli.js");

export async function createPlaywrightMCPClient(storageStatePath?: string) {
  const args = [playwrightMcpCli, "--headless"];
  if (storageStatePath) args.push("--storage-state", storageStatePath);
  return createMCPClient({
    transport: new Experimental_StdioMCPTransport({ command: "node", args }),
  });
}
